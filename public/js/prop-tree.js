function drawPropTree(propData) {
    const container = d3.select("#viz-container");
    const width = container.node().clientWidth;
    const height = container.node().clientHeight;
    
    const svg = container.append("svg").attr("viewBox", [0, 0, width, height]);
    const g = svg.append("g");
    
    svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", e => g.attr("transform", e.transform)))
       .call(d3.zoom().transform, d3.zoomIdentity.translate(150, height / 2));

    // Layout
    const tree = d3.tree().nodeSize([40, 250]);
    const root = d3.hierarchy(propData);
    
    // On déplie tout par défaut pour les propriétés (souvent peu nombreuses)
    const treeData = tree(root);
    const nodes = treeData.descendants();
    const links = treeData.links();

    // Liens (Gris foncé, droits avec angles pour différencier des concepts)
    g.append("g").selectAll("path").data(links).join("path")
        .attr("fill", "none").attr("stroke", "#7f8c8d").attr("stroke-width", "2px")
        .attr("d", d => `M${d.source.y},${d.source.x} L${d.source.y + 100},${d.source.x} L${d.source.y + 100},${d.target.x} L${d.target.y},${d.target.x}`);

    // Noeuds (Oranges)
    const node = g.append("g").selectAll("g").data(nodes).join("g")
        .attr("class", "searchable-node")
        .attr("transform", d => `translate(${d.y},${d.x})`);

    node.append("rect")
        .attr("y", -10).attr("x", -5)
        .attr("width", 10).attr("height", 20)
        .attr("fill", "#e67e22").attr("rx", 2);

    node.append("text")
        .attr("dy", "0.31em")
        .attr("x", d => d.children ? -12 : 12)
        .attr("text-anchor", d => d.children ? "end" : "start")
        .text(d => d.data.name)
        .style("font-size", "14px").style("font-weight", "bold").style("fill", "#2c3e50");
}
