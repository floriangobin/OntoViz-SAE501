function drawSunburst(hierarchyData, propHierarchyData) {
    const paneC = d3.select("#pane-c");
    const paneP = d3.select("#pane-p");

    if (!paneC.empty()) renderSunburst(hierarchyData, "#pane-c", true);
    
    if (!paneP.empty()) {
        if (propHierarchyData && propHierarchyData.children && propHierarchyData.children.length > 0) {
            renderSunburst(propHierarchyData, "#pane-p", false);
        } else {
            paneP.append("div").style("padding", "50px").html("<em>Aucune hiérarchie de propriétés trouvée.</em>");
        }
    }

    function renderSunburst(data, containerSelector, isConcept) {
        const container = d3.select(containerSelector);
        
        const breadcrumb = container.append("div").attr("class", "sunburst-breadcrumb").style("position", "absolute").style("top", "15px").style("left", "20px").style("z-index", "10").style("display", "flex").style("gap", "5px").style("flex-wrap", "wrap");

        const width = container.node().clientWidth;
        const height = container.node().clientHeight;
        const radius = Math.min(width, height) / 7;

        const svg = container.append("svg").attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`).style("font", "11px sans-serif");

        const hierarchy = d3.hierarchy(data).sum(d => d.value || 1).sort((a, b) => b.value - a.value);
        const root = d3.partition().size([2 * Math.PI, hierarchy.height + 1])(hierarchy);
        root.each(d => d.current = d);

        const baseColors = d3.scaleOrdinal(isConcept ? d3.schemeTableau10 : d3.schemeSet2);
        const getColor = d => {
            if (d.depth === 0) return "var(--bs-tertiary-bg)"; 
            let ancestor = d;
            while (ancestor.depth > 1) ancestor = ancestor.parent;
            return d3.color(baseColors(ancestor.data.name)).brighter((d.depth - 1) * 0.3); 
        };

        const arc = d3.arc().startAngle(d => d.x0).endAngle(d => d.x1).padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005)).padRadius(radius * 1.5).innerRadius(d => d.y0 * radius).outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

        const path = svg.append("g").selectAll("path").data(root.descendants().slice(1)).join("path").attr("class", "searchable-node")
            .attr("fill", d => getColor(d)).attr("fill-opacity", d => arcVisible(d.current) ? 0.9 : 0).attr("pointer-events", d => arcVisible(d.current) ? "auto" : "none").attr("d", d => arc(d.current)).style("cursor", d => d.children ? "pointer" : "default")
            .on("mouseover", function(event, d) {
                const sequence = d.ancestors().reverse();
                path.attr("fill-opacity", p => sequence.includes(p) ? 1 : 0.2); 
                const typeName = isConcept ? "Concept" : "Propriété";
                showTooltip(event, `<strong>${d.data.name}</strong><br><small>Hérite de ${typeName}: ${d.parent ? d.parent.data.name : 'Racine'}</small>`);
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function() { path.attr("fill-opacity", p => arcVisible(p.current) ? 0.9 : 0); hideTooltip(); })
            .on("click", clicked);

        const centerGroup = svg.append("g").style("cursor", "pointer").on("click", (e) => clicked(e, centerGroup.datum() || root)).on("mouseover", function() { d3.select(this).select("circle").attr("fill", "var(--bs-tertiary-bg)"); }).on("mouseout", function() { d3.select(this).select("circle").attr("fill", "var(--bs-body-bg)"); });

        centerGroup.append("circle").attr("r", radius - 2).attr("fill", "var(--bs-body-bg)").style("stroke", "#bdc3c7").style("stroke-dasharray", "3,3");

        const centerText = centerGroup.append("text").attr("text-anchor", "middle").attr("dy", "0em").style("font-weight", "bold").style("fill", "var(--bs-body-color)");
        const centerSubText = centerGroup.append("text").attr("text-anchor", "middle").attr("dy", "1.5em").style("font-size", "9px").style("fill", "#7f8c8d").text("Cliquez pour remonter");

        const label = svg.append("g").attr("pointer-events", "none").attr("text-anchor", "middle").style("user-select", "none").selectAll("text").data(root.descendants().slice(1)).join("text")
            .attr("class", "searchable-text").attr("dy", "0.35em").attr("fill-opacity", d => +labelVisible(d.current)).attr("transform", d => labelTransform(d.current)).text(d => d.data.name).style("fill", "var(--bs-body-color)").style("text-shadow", "0 1px 3px var(--bs-body-bg)");

        function clicked(event, p) {
            if (!p.children && event.currentTarget.tagName === 'path') return;
            const target = (event.currentTarget.tagName === 'g' || p.y0 === 0) && p.parent ? p.parent : p;
            
            if (isConcept) window.activeConcept = target.data.name; else window.activeProp = target.data.name;
            centerGroup.datum(target); 
            updateCenterInfo(target); updateBreadcrumb(target);

            root.each(d => d.target = {
                x0: Math.max(0, Math.min(1, (d.x0 - target.x0) / (target.x1 - target.x0))) * 2 * Math.PI,
                x1: Math.max(0, Math.min(1, (d.x1 - target.x0) / (target.x1 - target.x0))) * 2 * Math.PI,
                y0: Math.max(0, d.y0 - target.depth), y1: Math.max(0, d.y1 - target.depth)
            });

            const t = svg.transition().duration(750);
            path.transition(t).tween("data", d => { const i = d3.interpolate(d.current, d.target); return t => d.current = i(t); }).filter(function(d) { return +this.getAttribute("fill-opacity") || arcVisible(d.target); }).attr("fill-opacity", d => arcVisible(d.target) ? 0.9 : 0).attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none").attrTween("d", d => () => arc(d.current));
            label.transition(t).filter(function(d) { return +this.getAttribute("fill-opacity") || labelVisible(d.target); }).attr("fill-opacity", d => +labelVisible(d.target)).attrTween("transform", d => () => labelTransform(d.current));
        }

        function arcVisible(d) { return d.y1 <= 4 && d.y0 >= 1 && d.x1 > d.x0; } 
        function labelVisible(d) { return d.y1 <= 4 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05; } 
        function labelTransform(d) { const x = (d.x0 + d.x1) / 2 * 180 / Math.PI; const y = (d.y0 + d.y1) / 2 * radius; return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`; }

        function updateCenterInfo(d) { centerText.text(d.data.name); centerSubText.style("display", d.parent ? "inline" : "none"); }

        function updateBreadcrumb(d) {
            breadcrumb.html("");
            const sequence = d.ancestors().reverse();
            sequence.forEach((node, i) => {
                const badgeClass = isConcept ? "bg-primary text-white" : "bg-warning text-dark";
                const hoverClass = isConcept ? "bg-secondary text-white" : "bg-dark text-white";

                breadcrumb.append("span").attr("class", `badge rounded-pill ${badgeClass} border`).style("cursor", "pointer").style("font-size", "12px").style("transition", "background 0.2s").text(node.data.name)
                    .on("mouseover", function() { d3.select(this).classed(hoverClass, true).classed(badgeClass, false); }).on("mouseout", function() { d3.select(this).classed(hoverClass, false).classed(badgeClass, true); }).on("click", (e) => clicked(e, node));

                if (i < sequence.length - 1) { breadcrumb.append("span").style("color", "#bdc3c7").style("margin-top", "2px").html("&#10148;"); }
            });
        }

        let stateToRestore = isConcept ? window.activeConcept : window.activeProp;
        let startNode = root;
        if (stateToRestore && stateToRestore !== "Top" && stateToRestore !== "Propriétés") {
            const found = root.descendants().find(d => d.data.name === stateToRestore);
            if (found) startNode = found;
        }
        
        updateCenterInfo(startNode); updateBreadcrumb(startNode);
        if(startNode !== root) { clicked({currentTarget: {tagName: 'g'}}, startNode); }
    }
}