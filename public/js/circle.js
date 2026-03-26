function drawCircle(hierarchyData, propHierarchyData) {
    const paneC = d3.select("#pane-c");
    const paneP = d3.select("#pane-p");

    if (!paneC.empty()) renderCircle(hierarchyData, "#pane-c", true);
    
    if (!paneP.empty()) {
        if (propHierarchyData && propHierarchyData.children && propHierarchyData.children.length > 0) {
            renderCircle(propHierarchyData, "#pane-p", false);
        } else {
            paneP.append("div").style("padding", "50px").html("<em>Aucune hiérarchie de propriétés trouvée.</em>");
        }
    }

    function renderCircle(data, containerSelector, isConcept) {
        const container = d3.select(containerSelector);
        
        const breadcrumb = container.append("div").attr("class", "circle-breadcrumb").style("position", "absolute").style("top", "15px").style("left", "20px").style("z-index", "10").style("display", "flex").style("gap", "5px").style("flex-wrap", "wrap");

        const width = container.node().clientWidth;
        const height = container.node().clientHeight;

        const svg = container.append("svg").attr("viewBox", `-${width / 2} -${height / 2} ${width} ${height}`).style("cursor", "crosshair");

        const root = d3.hierarchy(data).sum(d => d.value || 1).sort((a, b) => b.value - a.value);
        const pack = d3.pack().size([width - 80, height - 80]).padding(4); 
        const nodes = pack(root).descendants();
        let focus = root; let view;

        const colorScale = isConcept ? d3.interpolateBlues : d3.interpolateOranges;
        const color = d3.scaleSequential(colorScale).domain([5, 0]);

        const node = svg.append("g").selectAll("g").data(nodes).join("g").attr("class", "searchable-node").style("cursor", "pointer")
            .on("mouseover", function(event, d) { 
                const strokeColor = isConcept ? "#e74c3c" : "#d35400";
                d3.select(this).select(".shape").attr("stroke", strokeColor).attr("stroke-width", 2); 
                showTooltip(event, `<strong>${d.data.name}</strong><br><small>${d.children ? d.children.length + " enfants" : "Concept final"}</small>`);
            })
            .on("mousemove", moveTooltip)
            .on("mouseout", function(event, d) { 
                d3.select(this).select(".shape").attr("stroke", d.depth === 0 ? "#bdc3c7" : (d.children ? null : "rgba(0,0,0,0.1)")).attr("stroke-width", 1); 
                hideTooltip();
            })
            .on("click", (event, d) => { if (focus !== d) { zoom(event, d); event.stopPropagation(); } });

        node.filter(d => d.depth === 0).append("rect").attr("class", "shape").attr("fill", "var(--bs-tertiary-bg)").attr("stroke", "#bdc3c7").attr("rx", 15).attr("ry", 15);
        node.filter(d => d.depth > 0).append("circle").attr("class", "shape").attr("fill", d => d.children ? color(d.depth) : "var(--bs-body-bg)").attr("stroke", d => d.children ? null : "rgba(0,0,0,0.1)"); 

        const labelGroup = svg.append("g").style("font", "13px sans-serif").attr("pointer-events", "none").attr("text-anchor", "middle");
        const label = labelGroup.selectAll("g").data(nodes).join("g").attr("class", "searchable-text").style("fill-opacity", d => d.parent === root ? 1 : 0).style("display", d => d.parent === root ? "inline" : "none");

        label.append("text").style("stroke", "var(--bs-body-bg)").style("stroke-width", "4px").style("stroke-linejoin", "round").text(d => d.data.name);
        label.append("text").style("fill", "var(--bs-body-color)").style("font-weight", "600").text(d => d.data.name);

        svg.on("click", (event) => zoom(event, root));
        let k = 1; zoomTo([root.x, root.y, root.r * 2 + 20]);

        function zoomTo(v) {
            k = width / v[2]; view = v;
            node.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
            node.filter(d => d.depth === 0).select("rect").attr("x", d => -(d.r * k)).attr("y", d => -(d.r * k)).attr("width", d => d.r * 2 * k).attr("height", d => d.r * 2 * k);
            node.filter(d => d.depth > 0).select("circle").attr("r", d => d.r * k);
            label.attr("transform", d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
        }

        function zoom(event, d) {
            focus = d;
            if (isConcept) window.activeConcept = d.data.name; else window.activeProp = d.data.name;
            updateBreadcrumb(d);

            const transition = svg.transition().duration(750).tween("zoom", d => {
                const i = d3.interpolateZoom(view, [focus.x, focus.y, focus.r * 2 + (focus.depth === 0 ? 20 : 5)]);
                return t => zoomTo(i(t));
            });

            label.filter(function(d) { return d.parent === focus || this.style.display === "inline"; }).transition(transition).style("fill-opacity", d => d.parent === focus ? 1 : 0).on("start", function(d) { if (d.parent === focus) this.style.display = "inline"; }).on("end", function(d) { if (d.parent !== focus) this.style.display = "none"; });
        }

        function updateBreadcrumb(d) {
            breadcrumb.html("");
            const sequence = d.ancestors().reverse();
            sequence.forEach((n, i) => {
                const badgeClass = isConcept ? "bg-primary text-white" : "bg-warning text-dark";
                const hoverClass = isConcept ? "bg-secondary text-white" : "bg-dark text-white";
                breadcrumb.append("span").attr("class", `badge rounded-pill ${badgeClass} border`).style("cursor", "pointer").style("font-size", "12px").style("transition", "background 0.2s").text(n.data.name)
                    .on("mouseover", function() { d3.select(this).classed(hoverClass, true).classed(badgeClass, false); }).on("mouseout", function() { d3.select(this).classed(hoverClass, false).classed(badgeClass, true); })
                    .on("click", (e) => { e.stopPropagation(); zoom(e, n); });
                if (i < sequence.length - 1) { breadcrumb.append("span").style("color", "#bdc3c7").style("margin-top", "2px").html("&#10148;"); }
            });
        }

        let stateToRestore = isConcept ? window.activeConcept : window.activeProp;
        let startNode = root;
        if (stateToRestore && stateToRestore !== "Top" && stateToRestore !== "Propriétés") {
            const found = root.descendants().find(d => d.data.name === stateToRestore);
            if (found) startNode = found;
        }
        
        updateBreadcrumb(startNode);
        if (startNode !== root) { setTimeout(() => zoom({stopPropagation:()=>{}}, startNode), 50); }
    }
}