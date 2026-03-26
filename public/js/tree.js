function drawTree(hierarchyData, propHierarchyData, propertiesData) {
    const paneC = d3.select("#pane-c");
    const paneP = d3.select("#pane-p");

    if (!paneC.empty()) {
        renderTree(hierarchyData, "#pane-c", propertiesData, true);
    }
    
    if (!paneP.empty()) {
        if (propHierarchyData && propHierarchyData.children && propHierarchyData.children.length > 0) {
            renderTree(propHierarchyData, "#pane-p", null, false);
        } else {
            paneP.append("div").style("padding", "50px").html("<em>Aucune hiérarchie de propriétés trouvée.</em>");
        }
    }

    function renderTree(data, containerSelector, propsList, isConcept) {
        const container = d3.select(containerSelector);
        const width = container.node().clientWidth;
        const height = container.node().clientHeight;
        
        const svg = container.append("svg").attr("viewBox", [0, 0, width, height]);
        const g = svg.append("g");
        
        const zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", e => g.attr("transform", e.transform));
        svg.call(zoom).on("dblclick.zoom", null);
        svg.call(zoom.transform, d3.zoomIdentity.translate(100, height / 2).scale(0.8));

        const markerId = isConcept ? "arrowhead-concept" : "arrowhead-prop";
        const defs = svg.append("defs");
        defs.append("marker").attr("id", markerId).attr("viewBox", "-0 -5 10 10").attr("refX", 15).attr("refY", 0).attr("orient", "auto").attr("markerWidth", 8).attr("markerHeight", 8).attr("xoverflow", "visible").append("svg:path").attr("d", "M 0,-5 L 10 ,0 L 0,5").attr("fill", "#e67e22").style("stroke", "none");

        const linkGroup = g.append("g").attr("class", "hierarchical-links");
        const propGroup = g.append("g").attr("class", "property-links");
        const nodeGroup = g.append("g").attr("class", "nodes");

        const tree = d3.tree().nodeSize([45, 250]); 
        const root = d3.hierarchy(data);
        root.x0 = 0; root.y0 = 0;

        if (root.children) root.children.forEach(collapse);

        let nodeId = 0;
        update(root);

        function collapse(d) {
            if (d.children) { d._children = d.children; d._children.forEach(collapse); d.children = null; }
        }

        function update(source) {
            const treeData = tree(root);
            const nodes = treeData.descendants();
            const links = treeData.links();

            const node = nodeGroup.selectAll('g.node').data(nodes, d => d.id || (d.id = ++nodeId));

            const nodeEnter = node.enter().append('g')
                .attr('class', 'node searchable-node') 
                .attr('transform', d => `translate(${source.y0},${source.x0})`)
                .style('cursor', 'pointer')
                .on('click', click)
                .on("mouseover", (e, d) => showTooltip(e, (isConcept ? "Concept : " : "Propriété : ") + "<strong>" + d.data.name + "</strong>"))
                .on("mousemove", moveTooltip)
                .on("mouseout", hideTooltip);

            if (isConcept) {
                nodeEnter.append('circle').attr('r', 1e-6).style('fill', d => d._children ? "#3498db" : "var(--bs-body-bg)").style('stroke', "#3498db").style('stroke-width', '2px');
            } else {
                nodeEnter.append('rect').attr('x', -6).attr('y', -6).attr('width', 1e-6).attr('height', 1e-6).style('fill', d => d._children ? "#e67e22" : "var(--bs-body-bg)").style('stroke', "#e67e22").style('stroke-width', '2px').attr("rx", 2); 
            }

            nodeEnter.append('text').attr('dy', '.35em').attr('x', d => d.children || d._children ? -13 : 13).attr('text-anchor', d => d.children || d._children ? 'end' : 'start').text(d => d.data.name).style('font', '13px sans-serif').style('fill', 'var(--bs-body-color)').style('text-shadow', '0 1px 3px var(--bs-body-bg)'); 

            const nodeUpdate = nodeEnter.merge(node);
            nodeUpdate.transition().duration(750).attr('transform', d => `translate(${d.y},${d.x})`);
            
            if (isConcept) { nodeUpdate.select('circle').attr('r', 7).style('fill', d => d._children ? "#3498db" : "var(--bs-body-bg)"); } 
            else { nodeUpdate.select('rect').attr('width', 12).attr('height', 12).style('fill', d => d._children ? "#e67e22" : "var(--bs-body-bg)"); }

            const nodeExit = node.exit().transition().duration(750).attr('transform', d => `translate(${source.y},${source.x})`).remove();
            nodeExit.select('circle').attr('r', 1e-6); nodeExit.select('rect').attr('width', 1e-6).attr('height', 1e-6);

            const link = linkGroup.selectAll('path.link').data(links, d => d.target.id);
            const linkEnter = link.enter().insert('path', 'g').attr('class', 'link').style('fill', 'none').style('stroke', isConcept ? '#bdc3c7' : '#f39c12').style('stroke-width', '1.5px')
                .attr('d', d => { const o = {x: source.x0, y: source.y0}; return d3.linkHorizontal().x(d => d.y).y(d => d.x)({source: o, target: o}); });
            linkEnter.merge(link).transition().duration(750).attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x));
            link.exit().transition().duration(750).attr('d', d => { const o = {x: source.x, y: source.y}; return d3.linkHorizontal().x(d => d.y).y(d => d.x)({source: o, target: o}); }).remove();

            if (isConcept && propsList) {
                const visibleNodes = new Map(nodes.map(n => [n.data.name, n]));
                let activeProperties = propsList.filter(p => visibleNodes.has(p.source) && visibleNodes.has(p.target)).map(p => ({ ...p, sourceNode: visibleNodes.get(p.source), targetNode: visibleNodes.get(p.target) }));

                const propLink = propGroup.selectAll('g.prop-link').data(activeProperties, d => d.source + "-" + d.target + "-" + d.name);
                const propEnter = propLink.enter().append('g').attr('class', 'prop-link').style('opacity', 0); 
                propEnter.append('path').style('fill', 'none').style('stroke', '#e67e22').style('stroke-width', '1.5px').style('stroke-dasharray', '5,5').attr('marker-end', `url(#${markerId})`)
                    .attr('d', d => drawArc(d.sourceNode, d.targetNode));
                propEnter.append('rect').attr('fill', 'var(--bs-body-bg)').attr('rx', 3).attr('ry', 3);
                propEnter.append('text').attr('fill', '#d35400').attr('font-size', '10px').attr('font-weight', 'bold').attr('text-anchor', 'middle').attr('dy', '0.35em').text(d => d.name);

                const propUpdate = propEnter.merge(propLink);
                propUpdate.transition().duration(750).style('opacity', 1);
                propUpdate.select('path').transition().duration(750).attr('d', d => drawArc(d.sourceNode, d.targetNode));

                propUpdate.each(function(d) {
                    const midX = (d.sourceNode.y + d.targetNode.y) / 2; const midY = (d.sourceNode.x + d.targetNode.x) / 2 - 15;
                    const txt = d3.select(this).select('text'); txt.transition().duration(750).attr('x', midX).attr('y', midY);
                    const bbox = txt.node().getBBox(); d3.select(this).select('rect').transition().duration(750).attr('x', midX - (bbox.width / 2) - 2).attr('y', midY - (bbox.height / 2)).attr('width', bbox.width + 4).attr('height', bbox.height);
                });
                propLink.exit().transition().duration(300).style('opacity', 0).remove();
            }
            nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
            if (window.applySearch) setTimeout(window.applySearch, 100);
        }

        function drawArc(source, target) {
            const dx = target.y - source.y; const dy = target.x - source.x; const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; 
            return `M${source.y},${source.x}A${dr},${dr} 0 0,1 ${target.y},${target.x}`;
        }

        function click(event, d) {
            if (isConcept) window.activeConcept = d.data.name; else window.activeProp = d.data.name;
            if (d.children) { d._children = d.children; d.children = null; } else { d.children = d._children; d._children = null; }
            update(d);
        }
        
        let stateToRestore = isConcept ? window.activeConcept : window.activeProp;
        if (stateToRestore && stateToRestore !== "Top" && stateToRestore !== "Propriétés") {
            let activeNode = root.descendants().find(d => d.data.name === stateToRestore);
            if (activeNode) {
                let current = activeNode.parent;
                while(current) { if(current._children) { current.children = current._children; current._children = null; } current = current.parent; }
                update(root);
                setTimeout(() => { svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity.translate(width/2 - activeNode.y, height/2 - activeNode.x).scale(1)); }, 100);
            }
        }
    }
}