<?php
ob_start(); // On commence à capturer tout ce qui sort
session_start();
ini_set('display_errors', 0);
ini_set('memory_limit', '256M'); // On donne plus de RAM au script
ini_set('upload_max_filesize', '20M');
ini_set('post_max_size', '20M');
error_reporting(E_ALL & ~E_DEPRECATED & ~E_USER_DEPRECATED);
require __DIR__ . '/../vendor/autoload.php'; // CHEMIN ABSOLU SÉCURISÉ

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

\EasyRdf\RdfNamespace::setDefault('rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
\EasyRdf\RdfNamespace::setDefault('rdfs', 'http://www.w3.org/2000/01/rdf-schema#');
\EasyRdf\RdfNamespace::setDefault('owl', 'http://www.w3.org/2002/07/owl#');

// Récupération de l'historique de session
if (isset($_GET['history'])) {
    echo json_encode($_SESSION['history'] ?? []);
    exit;
}

$graph = new \EasyRdf\Graph();

// --- CHARGEMENT INTELLIGENT ---
if (isset($_FILES['file']) && $_FILES['file']['error'] == UPLOAD_ERR_OK) {
    $filename = $_FILES['file']['name'];
    $tmpPath = $_FILES['file']['tmp_name'];
    $fileContent = file_get_contents($tmpPath);
    
    // On regarde le premier caractère (en ignorant les espaces)
    $firstChar = substr(trim($fileContent), 0, 1);

    try {
        if ($firstChar === '{' || $firstChar === '[') {
            // C'est du JSON ! On force le format jsonld
            $graph->parse($fileContent, 'jsonld');
        } else {
            // C'est (normalement) du XML ou du Turtle
            $graph->parse($fileContent);
        }
    } catch (Exception $e) {
        // Si l'auto-détection échoue encore, on tente le tout pour le tout
        try {
            $graph->parse($fileContent, 'rdfxml');
        } catch (Exception $e2) {
            http_response_code(400);
            echo json_encode(["error" => "Format de contenu illisible : " . $e->getMessage()]);
            exit;
        }
    }
}

try {
    $resources = $graph->resources();
    $classNodes = [];
    $propNodes = [];
    $propertiesList = [];

    foreach ($resources as $uri => $resource) {
        if (!$uri || strpos($uri, '_:') === 0) continue;
        
        $name = $resource->get('rdfs:label') ? (string)$resource->get('rdfs:label') : (\EasyRdf\RdfNamespace::shorten($uri) ?: preg_replace('/^.*[#\/]/', '', $uri));

        // --- GESTION DES PROPRIÉTÉS ---
        $isObject = $resource->isA('owl:ObjectProperty');
        $isData = $resource->isA('owl:DatatypeProperty');
        $isRdfProp = $resource->isA('rdf:Property');

        if ($isObject || $isData || $isRdfProp) {
            $domain = $resource->get('rdfs:domain');
            $range = $resource->get('rdfs:range');
            
            $sourceName = ($domain && !$domain->isBNode()) ? (\EasyRdf\RdfNamespace::shorten($domain->getUri()) ?: preg_replace('/^.*[#\/]/', '', $domain->getUri())) : "Inconnu";
            $targetName = ($range && !$range->isBNode()) ? (\EasyRdf\RdfNamespace::shorten($range->getUri()) ?: preg_replace('/^.*[#\/]/', '', $range->getUri())) : "Inconnu";

            $propertiesList[] = [
                "source" => $sourceName,
                "target" => $targetName,
                "name" => $name,
                "type" => $isData ? "datatype" : "object"
            ];

            if (!preg_match('/#(topObjectProperty|topDataProperty)/i', $uri)) {
                $propNodes[$uri] = ["name" => $name, "children" => [], "parentUris" => [], "type" => $isData ? "datatype" : "object"];
                foreach ($resource->all('rdfs:subPropertyOf') as $super) {
                    if ($super instanceof \EasyRdf\Resource && !$super->isBNode()) {
                        $propNodes[$uri]["parentUris"][] = $super->getUri();
                    }
                }
            }
            continue;
        }

        // --- GESTION DES CLASSES ---
        $isClass = $resource->isA('owl:Class') || $resource->isA('rdfs:Class') || $resource->isA('Class') || count($resource->all('rdfs:subClassOf')) > 0 || count($graph->resourcesMatching('rdfs:subClassOf', $resource)) > 0;
        
        if (!$isClass || preg_match('/#(Thing|Nothing|Restriction|Class|NamedIndividual|Ontology|AnnotationProperty|AllDisjointClasses)/i', $uri)) continue;

        $classNodes[$uri] = ["name" => $name, "children" => [], "parentUris" => []];
        foreach ($resource->all('rdfs:subClassOf') as $super) {
            if ($super instanceof \EasyRdf\Resource && !$super->isBNode() && !preg_match('/#(Thing|Nothing)/i', $super->getUri())) {
                $classNodes[$uri]["parentUris"][] = $super->getUri();
            }
        }
    }

    function buildTree($nodesMap) {
        $tree = [];
        foreach ($nodesMap as $uri => &$node) {
            $hasParent = false;
            foreach ($node["parentUris"] as $pUri) {
                if (isset($nodesMap[$pUri])) {
                    $nodesMap[$pUri]["children"][] = &$node;
                    $hasParent = true;
                }
            }
            if (!$hasParent) $tree[] = &$node;
        }
        return $tree;
    }

    function formatForD3(&$items, $processed = []) {
        $cleaned = [];
        foreach ($items as &$item) {
            if (in_array($item['name'], $processed)) continue; 
            $newNode = ["name" => $item["name"]];
            if (isset($item['type'])) $newNode['type'] = $item['type'];
            if (!empty($item["children"])) {
                $children = formatForD3($item["children"], array_merge($processed, [$item['name']]));
                if (!empty($children)) $newNode["children"] = $children;
                else $newNode["value"] = 1; 
            } else $newNode["value"] = 1; 
            $cleaned[] = $newNode;
        }
        usort($cleaned, function($a, $b) { return strcmp($a['name'], $b['name']); });
        return $cleaned;
    }

    $result = [
        "filename" => $filename,
        "hierarchy" => ["name" => "Top", "children" => formatForD3(buildTree($classNodes))],
        "propHierarchy" => ["name" => "Propriétés", "children" => formatForD3(buildTree($propNodes))],
        "properties" => $propertiesList
    ];

    // --- NETTOYAGE ET SAUVEGARDE ---
    if (!isset($_SESSION['history'])) $_SESSION['history'] = [];
    
    // On ne garde que les données pures (JSON) pour ne pas saturer la session
    $_SESSION['history'][$filename] = json_decode(json_encode($result), true);

    // On limite à 3 fichiers au lieu de 5 pour économiser la mémoire sur Alwaysdata
    if (count($_SESSION['history']) > 3) {
        array_shift($_SESSION['history']);
    }

    ob_clean(); // ON EFFACE TOUT ce qui a pu être écrit par erreur (Warnings, etc.)
    header('Content-Type: application/json');
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
    exit;

} catch (Exception $e) {
    ob_clean(); // On efface aussi en cas d'erreur
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
    exit;
}