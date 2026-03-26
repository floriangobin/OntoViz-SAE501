<?php
session_start();
ini_set('display_errors', 1); // ON AFFICHE L'ERREUR POUR DÉBOGUER
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

if (isset($_FILES['file']) && $_FILES['file']['error'] == UPLOAD_ERR_OK) {
    $filename = $_FILES['file']['name'];
    $graph->parseFile($_FILES['file']['tmp_name'], (\EasyRdf\Format::guessFormat(null, $_FILES['file']['type'])) ? null : 'rdfxml');
} else {
    echo json_encode(["error" => "Aucun fichier reçu."]); 
    exit;
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

    if (!isset($_SESSION['history'])) $_SESSION['history'] = [];
    $_SESSION['history'][$filename] = $result;
    if (count($_SESSION['history']) > 5) array_shift($_SESSION['history']);

    echo json_encode($result, JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(["error" => $e->getMessage()]);
}
?>