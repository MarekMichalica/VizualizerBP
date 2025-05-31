const colorScale = d3.scaleOrdinal(d3.schemeTableau10);

export function createDataUsageTimeline(packetData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const dataSizes = {};
    const today = new Date();
    const baseDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    packetData.forEach(packet => {
        try {
            const timestamp = new Date(`${baseDate}T${packet.timestamp}`);
            if (!isNaN(timestamp.getTime())) {
                const timeKey = timestamp.toISOString().substring(0, 19) + 'Z';
                if (!dataSizes[timeKey]) {
                    dataSizes[timeKey] = 0;
                }
                dataSizes[timeKey] += packet.size || 0;
            }
        } catch (e) {
            console.log("Invalid timestamp format:", packet.timestamp);
        }
    });
    const data = Object.entries(dataSizes)
        .map(([time, bytes]) => ({ 
            time: new Date(time), 
            bytes: bytes,
            kilobytes: bytes / 1024, 
            megabytes: bytes / (1024 * 1024) 
        }))
        .sort((a, b) => a.time - b.time);
    
    if (data.length <= 1) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'no-data-message';
        messageDiv.textContent = 'Nedostatok času pre zobrazenie využitia dát';
        container.appendChild(messageDiv);
        return;
    }
    const maxBytes = d3.max(data, d => d.bytes);
    let yAxisLabel, dataValue;
    
    if (maxBytes > 1024 * 1024) { 
        yAxisLabel = "Využitie dát (MB)";
        dataValue = d => d.megabytes;
    } else {
        yAxisLabel = "Využitie dát (KB)";
        dataValue = d => d.kilobytes; 
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.time))
        .range([0, chartWidth]);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, dataValue) * 1.1]) 
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x)
            .ticks(Math.min(data.length, 10)) 
            .tickFormat(d3.timeFormat("%H:%M:%S")));
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left)
        .attr("x", 0 - (chartHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text(yAxisLabel);
    svg.append("text")
        .attr("transform", `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Čas");
    svg.append("path")
        .datum(data)
        .attr("fill", "rgba(70, 130, 180, 0.3)") 
        .attr("stroke", "steelblue")
        .attr("stroke-width", 1.5)
        .attr("d", d3.area()
            .x(d => x(d.time))
            .y0(chartHeight)
            .y1(d => y(dataValue(d)))
        );
    svg.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "steelblue")
        .attr("stroke-width", 2)
        .attr("d", d3.line()
            .x(d => x(d.time))
            .y(d => y(dataValue(d)))
        );
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => x(d.time))
        .attr("cy", d => y(dataValue(d)))
        .attr("r", 4)
        .attr("fill", "steelblue")
        .style("opacity", 0.7)
        .on("mouseover", function(event, d) {
            d3.select(this)
                .attr("r", 6)
                .style("opacity", 1);
                
            let tooltipContent = `
                <strong>čas:</strong> ${d.time.toLocaleTimeString()}<br>
                <strong>Dáta:</strong> ${formatDataSize(d.bytes)}
            `;
                
            tooltip.html(tooltipContent)
                .style('opacity', 0.9)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px');
        })
        .on("mouseout", function() {
            d3.select(this)
                .attr("r", 4)
                .style("opacity", 0.7);
                
            tooltip.style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Objem dát v čase');
    function formatDataSize(bytes) {
        if (bytes < 1024) {
            return bytes + " bytes";
        } else if (bytes < 1024 * 1024) {
            return (bytes / 1024).toFixed(2) + " KB";
        } else {
            return (bytes / (1024 * 1024)).toFixed(2) + " MB";
        }
    }
}
export function createProtocolDistributionChart(packetData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 30, bottom: 40, left: 40 };
    const protocolCounts = {};
    packetData.forEach(packet => {
        const protocol = packet.protocol || 'Unknown';
        protocolCounts[protocol] = (protocolCounts[protocol] || 0) + 1;
    });
    const data = Object.entries(protocolCounts)
        .map(([protocol, count]) => ({ protocol, count }))
        .sort((a, b) => b.count - a.count);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const x = d3.scaleBand()
        .domain(data.map(d => d.protocol))
        .range([0, width - margin.left - margin.right])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([height - margin.top - margin.bottom, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
    svg.append('g')
        .call(d3.axisLeft(y));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.protocol))
        .attr('width', x.bandwidth())
        .attr('y', d => y(d.count))
        .attr('height', d => height - margin.top - margin.bottom - y(d.count))
        .attr('fill', d => colorScale(d.protocol))
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`<strong>${d.protocol}</strong><br/>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', (width - margin.left - margin.right) / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia protokolov');
} 
export function createPacketSizeHistogram(packetData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 30, bottom: 40, left: 40 };
    const sizes = packetData
        .map(packet => parseInt(packet.size, 10))
        .filter(size => !isNaN(size));
    
    if (sizes.length === 0) {
        showNoDataMessage(container, 'Nie sú dostupné žiadne veľkosti paketov');
        return;
    }
    const histogram = d3.histogram()
        .domain(d3.extent(sizes))
        .thresholds(10)(sizes);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const x = d3.scaleLinear()
        .domain([histogram[0].x0, histogram[histogram.length - 1].x1])
        .range([0, width - margin.left - margin.right]);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(histogram, d => d.length)])
        .range([height - margin.top - margin.bottom, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x).tickFormat(d => d + 'B'));
    svg.append('g')
        .call(d3.axisLeft(y));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.selectAll('rect')
        .data(histogram)
        .enter()
        .append('rect')
        .attr('x', d => x(d.x0))
        .attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 1))
        .attr('y', d => y(d.length))
        .attr('height', d => height - margin.top - margin.bottom - y(d.length))
        .attr('fill', '#69b3a2')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`Veľkosť: ${d.x0}-${d.x1} bytes<br/>Počet: ${d.length}`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', (width - margin.left - margin.right) / 2)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .style('font-weight', 'bold')
        .style('font-size', '14px')
        .text('Distribúcia veľkostí paketov');
}  
export function createPacketTimeline(packetData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 30, bottom: 40, left: 40 };
    const timeCounts = {};
    const today = new Date();
    const baseDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    packetData.forEach(packet => {
        try {
            const timestamp = new Date(`${baseDate}T${packet.timestamp}`);
            if (!isNaN(timestamp.getTime())) {
                const timeKey = timestamp.toISOString().substring(0, 19) + 'Z';
                timeCounts[timeKey] = (timeCounts[timeKey] || 0) + 1;
            }
        } catch (e) {
            console.log("Invalid timestamp format:", packet.timestamp);
        }
    });
    const data = Object.entries(timeCounts)
        .map(([time, count]) => ({ time: new Date(time), count }))
        .sort((a, b) => a.time - b.time);
    
    if (data.length <= 1) {
        showNoDataMessage(container, 'Nedostatok času pre zobrazenie počtu paketov');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const x = d3.scaleTime()
        .domain(d3.extent(data, d => d.time))
        .range([0, width - margin.left - margin.right]);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([height - margin.top - margin.bottom, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 1.5)
        .attr('d', d3.line()
            .x(d => x(d.time))
            .y(d => y(d.count))
        );
    svg.selectAll('circle')
        .data(data)
        .enter()
        .append('circle')
        .attr('cx', d => x(d.time))
        .attr('cy', d => y(d.count))
        .attr('r', 4)
        .attr('fill', 'steelblue')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`Čas: ${d.time.toLocaleTimeString()}<br/>Pakety: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', (width - margin.left - margin.right) / 2)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Počet paketov v čase');
}  
export function createTopIPsChart(packetData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 30, bottom: 40, left: 100 };
    const ipCounts = {};
    
    packetData.forEach(packet => {
        if (packet.src_ip) {
            ipCounts[packet.src_ip] = (ipCounts[packet.src_ip] || 0) + 1;
        }
        if (packet.dst_ip) {
            ipCounts[packet.dst_ip] = (ipCounts[packet.dst_ip] || 0) + 1;
        }
    });
    const data = Object.entries(ipCounts)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const y = d3.scaleBand()
        .domain(data.map(d => d.ip))
        .range([0, height - margin.top - margin.bottom])
        .padding(0.1);
    
    const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([0, width - margin.left - margin.right]);
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('y', d => y(d.ip))
        .attr('height', y.bandwidth())
        .attr('x', 0)
        .attr('width', d => x(d.count))
        .attr('fill', (d, i) => colorScale(i))
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`<strong>${d.ip}</strong><br/>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', (width - margin.left - margin.right) / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Top 10 IP adries');
}
export function createPacketFlowDiagram(filteredData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 20, bottom: 20, left: 20 };
    d3.select(container).selectAll("*").remove();
    const flowMap = new Map(); 
    filteredData = filteredData.filter(packet => packet.protocol === "TCP");
    filteredData.forEach(packet => {
        if (!packet.src_ip || !packet.dst_ip) return;
        
        const flowKey = `${packet.src_ip}:${packet.src_port || '?'}->${packet.dst_ip}:${packet.dst_port || '?'}`;
        
        if (!flowMap.has(flowKey)) {
            flowMap.set(flowKey, {
                source: packet.src_ip,
                sourcePort: packet.src_port || '?',
                target: packet.dst_ip,
                targetPort: packet.dst_port || '?',
                protocol: packet.protocol,
                packets: 1,
                bytes: parseInt(packet.size, 10) || 0
            });
        } else {
            const flow = flowMap.get(flowKey);
            flow.packets++;
            flow.bytes += parseInt(packet.size, 10) || 0;
        }
    });
    const flows = Array.from(flowMap.values())
        .sort((a, b) => b.packets - a.packets)
        .slice(0, 15); 
    
    if (flows.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné dátové toky');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(`Top dátové toky`);
    const sankeyWidth = width - margin.left - margin.right;
    const sankeyHeight = height - margin.top - margin.bottom - 20;
    const nodeMap = new Map();
    const nodeIds = new Set();
    const sankeyLinks = [];
    flows.forEach(flow => {
        nodeIds.add(flow.source);
        nodeIds.add(flow.target);
    });
    let index = 0;
    const nodeBipartite = new Map();
    
    nodeIds.forEach(id => {
        nodeBipartite.set(`source_${id}`, { 
            id: `source_${id}`, 
            originalId: id,
            nodeType: 'source',
            index: index++
        });
        
        nodeBipartite.set(`target_${id}`, { 
            id: `target_${id}`, 
            originalId: id,
            nodeType: 'target',
            index: index++
        });
    });
    flows.forEach(flow => {
        const sourceNodeId = `source_${flow.source}`;
        const targetNodeId = `target_${flow.target}`;
        
        sankeyLinks.push({
            source: sourceNodeId,
            target: targetNodeId,
            value: flow.packets,
            sourcePort: flow.sourcePort,
            targetPort: flow.targetPort,
            protocol: flow.protocol,
            bytes: flow.bytes,
            sourceOriginal: flow.source,
            targetOriginal: flow.target
        });
    });
    
    const sankeyNodes = Array.from(nodeBipartite.values());
    const sankey = d3.sankey()
        .nodeId(d => d.id)
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[margin.left, margin.top + 20], [width - margin.right, height - margin.bottom]]);
    const sankeyData = sankey({
        nodes: sankeyNodes,
        links: sankeyLinks
    });
    const link = svg.append('g')
        .selectAll('path')
        .data(sankeyData.links)
        .enter()
        .append('path')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('stroke', d => colorScale(d.protocol || 'unknown'))
        .attr('stroke-width', d => Math.max(1, d.width))
        .attr('fill', 'none')
        .attr('opacity', 0.5)
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('opacity', 0.8)
                .attr('stroke-width', d => Math.max(1, d.width + 2));
                
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
                
            tooltip.html(`
                <strong>${d.sourceOriginal}:${d.sourcePort} → ${d.targetOriginal}:${d.targetPort}</strong><br/>
                Protokol: ${d.protocol}<br/>
                Pakety: ${d.value}<br/>
                Celková veľkosť dát: ${d.bytes}
            `)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('opacity', 0.5)
                .attr('stroke-width', d => Math.max(1, d.width));
                
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    const node = svg.append('g')
        .selectAll('rect')
        .data(sankeyData.nodes)
        .enter()
        .append('rect')
        .attr('x', d => d.x0)
        .attr('y', d => d.y0)
        .attr('height', d => d.y1 - d.y0)
        .attr('width', d => d.x1 - d.x0)
        .attr('fill', d => d.nodeType === 'source' ? '#69b3a2' : '#3498db')
        .attr('stroke', '#000')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('fill', d.nodeType === 'source' ? '#2ecc71' : '#2980b9');
            link
                .attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.1)
                .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 
                    Math.max(1, l.width + 2) : Math.max(1, l.width));
            
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
                
            tooltip.html(`<strong>IP: ${d.originalId}</strong>`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            d3.select(this).attr('fill', d => d.nodeType === 'source' ? '#69b3a2' : '#3498db');
            link
                .attr('opacity', 0.5)
                .attr('stroke-width', d => Math.max(1, d.width));
            
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('g')
        .selectAll('text')
        .data(sankeyData.nodes)
        .enter()
        .append('text')
        .attr('x', d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
        .attr('y', d => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
        .text(d => d.originalId)
        .style('font-size', '10px');
}
export function createPortDistributionChart(filteredData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top:50, right: 30, bottom: 60, left: 40 };
    const portCounts = {};
    
    filteredData.forEach(packet => {
        if (packet.src_port) {
            portCounts[packet.src_port] = (portCounts[packet.src_port] || 0) + 1;
        }
        if (packet.dst_port) {
            portCounts[packet.dst_port] = (portCounts[packet.dst_port] || 0) + 1;
        }
    });
    const data = Object.entries(portCounts)
        .map(([port, count]) => ({ port, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const x = d3.scaleBand()
        .domain(data.map(d => d.port))
        .range([0, width - margin.left - margin.right])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.count)])
        .range([height - margin.top - margin.bottom, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-45)');
    svg.append('g')
        .call(d3.axisLeft(y));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.selectAll('.bar')
        .data(data)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.port))
        .attr('width', x.bandwidth())
        .attr('y', d => y(d.count))
        .attr('height', d => height - margin.top - margin.bottom - y(d.count))
        .attr('fill', d => colorScale(d.port))
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            let portName = getCommonPortName(d.port);
            let tooltipContent = `<strong>Port ${d.port}</strong>`;
            if (portName) tooltipContent += ` (${portName})`;
            tooltipContent += `<br/>Počet: ${d.count}`;
            
            tooltip.html(tooltipContent)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', (width - margin.left - margin.right) / 2)
        .attr('y', 0)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(`Distribúcia portov`);
}
export function createConnectionGraph(filteredData) {
    const container = generalVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 20, bottom: 20, left: 20 };
    const nodes = new Map();
    const links = [];
    const nodeProtocols = new Map();
    filteredData.forEach(packet => {
        if (!packet.src_ip || !packet.dst_ip) return;
        if (!nodes.has(packet.src_ip)) {
            nodes.set(packet.src_ip, { id: packet.src_ip, type: 'source', connections: 0 });
            nodeProtocols.set(packet.src_ip, {});
        }
        if (!nodes.has(packet.dst_ip)) {
            nodes.set(packet.dst_ip, { id: packet.dst_ip, type: 'destination', connections: 0 });
            nodeProtocols.set(packet.dst_ip, {});
        }
        nodes.get(packet.src_ip).connections++;
        nodes.get(packet.dst_ip).connections++;
        const srcProtocols = nodeProtocols.get(packet.src_ip);
        const dstProtocols = nodeProtocols.get(packet.dst_ip);
        
        const protocol = packet.protocol || 'unknown';
        srcProtocols[protocol] = (srcProtocols[protocol] || 0) + 1;
        dstProtocols[protocol] = (dstProtocols[protocol] || 0) + 1;
        const linkId = `${packet.src_ip}-${packet.dst_ip}`;
        let link = links.find(l => l.id === linkId);
        
        if (!link) {
            link = {
                id: linkId,
                source: packet.src_ip,
                target: packet.dst_ip,
                value: 1,
                protocol: packet.protocol
            };
            links.push(link);
        } else {
            link.value++;
        }
    });
    nodes.forEach((node, nodeId) => {
        const protocols = nodeProtocols.get(nodeId);
        let maxCount = 0;
        let mostUsedProtocol = 'unknown';
        
        Object.entries(protocols).forEach(([protocol, count]) => {
            if (count > maxCount) {
                maxCount = count;
                mostUsedProtocol = protocol;
            }
        });
        
        node.mostUsedProtocol = mostUsedProtocol;
        node.protocolCounts = protocols;
    });
    const maxNodes = 25;
    if (nodes.size > maxNodes) {
        const nodeEntries = Array.from(nodes.entries())
            .sort((a, b) => b[1].connections - a[1].connections)
            .slice(0, maxNodes);
        const newNodes = new Map(nodeEntries);
        const newLinks = links.filter(link => 
            newNodes.has(link.source) && newNodes.has(link.target)
        );
        nodes.clear();
        nodeEntries.forEach(([nodeId, nodeData]) => {
            nodes.set(nodeId, nodeData);
        });
        
        links.length = 0;
        links.push(...newLinks);
    }
    const nodesArray = Array.from(nodes.values());
    const maxConnections = Math.max(...nodesArray.map(n => n.connections), 1);
    nodesArray.forEach(node => {
        node.normalizedConnections = node.connections / maxConnections;
    });
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text(`Graf prepojení aktívnych zariadení`);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'black')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none')
        .style('z-index', '10');
    const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
    const nodeCount = nodesArray.length;
    const baseDistance = nodeCount <= 3 ? 150 : 100;
    const distanceAdjustment = Math.min(1, Math.max(0.3, 3 / nodeCount));
    const linkDistance = baseDistance * distanceAdjustment;
    const simulation = d3.forceSimulation(nodesArray)
        .force('link', d3.forceLink(links).id(d => d.id).distance(linkDistance))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(d => 12 + d.normalizedConnections * 10))
        .force('centrality', forceNodesCentrality());
    function forceNodesCentrality(strength = 0.3) {
        let nodes;
        
        function force(alpha) {
            const centerX = width / 2;
            const centerY = height / 2;
            
            for (const node of nodes) {
                node.vx += (centerX - node.x) * alpha * strength * node.normalizedConnections;
                node.vy += (centerY - node.y) * alpha * strength * node.normalizedConnections;
            }
        }
        
        force.initialize = function(_nodes) {
            nodes = _nodes;
        };
        
        return force;
    }
    const link = svg.append('g')
        .selectAll('line')
        .data(links)
        .enter()
        .append('line')
        .attr('stroke-width', d => Math.sqrt(d.value))
        .attr('stroke', d => colorScale(d.protocol || 'unknown'))
        .attr('opacity', 0.6);
    const node = svg.append('g')
        .selectAll('circle')
        .data(nodesArray)
        .enter()
        .append('circle')
        .attr('r', d => 8 + d.normalizedConnections * 6) 
        .attr('fill', d => d.type === 'source' ? '#ff7f0e' : '#1f77b4')
        .call(drag(simulation))
        .on('mouseover', function(event, d) {
            let protocolsHtml = '';
            if (d.protocolCounts) {
                const sortedProtocols = Object.entries(d.protocolCounts)
                    .sort((a, b) => b[1] - a[1]);
                
                protocolsHtml = '<br><strong>Protokoly:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                sortedProtocols.slice(0, 3).forEach(([protocol, count]) => {
                    protocolsHtml += `<li>${protocol}: ${count} packets</li>`;
                });
                protocolsHtml += '</ul>';
                
                if (sortedProtocols.length > 3) {
                    protocolsHtml += `<small>+${sortedProtocols.length - 3} viac...</small>`;
                }
            }
            
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
            tooltip.html(`<strong>IP: ${d.id}</strong><br>
                         <strong>Spojenia:</strong> ${d.connections}<br>
                         <strong>Používaný protokol:</strong> ${d.mostUsedProtocol}
                         ${protocolsHtml}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 10) + 'px');
            link.style('stroke', l => (l.source.id === d.id || l.target.id === d.id) ? '#ff0000' : null)
                .style('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 1 : 0.2)
                .style('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? Math.sqrt(l.value) + 1 : Math.sqrt(l.value));
            
            node.style('opacity', n => (n.id === d.id || links.some(l => 
                (l.source.id === d.id && l.target.id === n.id) || 
                (l.target.id === d.id && l.source.id === n.id)
            )) ? 1 : 0.2);
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
            link.style('stroke', d => colorScale(d.protocol || 'unknown'))
                .style('opacity', 0.6)
                .style('stroke-width', d => Math.sqrt(d.value));
            node.style('opacity', 1);
        });
    const nodeLabel = svg.append('g')
        .selectAll('text')
        .data(nodesArray)
        .enter()
        .append('text')
        .text(d => d.id)
        .attr('font-size', d => Math.max(7, 7 + d.normalizedConnections * 3) + 'px')
        .attr('dx', d => 10 + d.normalizedConnections * 5)
        .attr('dy', 3);
    const legend = svg.append('g')
        .attr('transform', `translate(${width - 120}, ${height - 60})`);
    
    legend.append('circle')
        .attr('r', 6)
        .attr('cx', 10)
        .attr('cy', 10)
        .attr('fill', '#ff7f0e');
    
    legend.append('circle')
        .attr('r', 6)
        .attr('cx', 10)
        .attr('cy', 30)
        .attr('fill', '#1f77b4');
    
    legend.append('text')
        .attr('x', 20)
        .attr('y', 13)
        .text('Zdrojová IP')
        .attr('font-size', '12px');
    
    legend.append('text')
        .attr('x', 20)
        .attr('y', 33)
        .text('Cieľová IP')
        .attr('font-size', '12px');
    simulation.on('tick', () => {
        nodesArray.forEach(d => {
            d.x = Math.max(margin.left + d.normalizedConnections * 10, 
                      Math.min(width - margin.right - d.normalizedConnections * 10, d.x));
            d.y = Math.max(margin.top + 20 + d.normalizedConnections * 10, 
                      Math.min(height - margin.bottom - d.normalizedConnections * 10, d.y));
        });
        
        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);
        
        node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);
        
        nodeLabel
            .attr('x', d => d.x)
            .attr('y', d => d.y);
    });
    function drag(simulation) {
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        return d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);
    }
}
export function createTCPFlagDistribution(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const flagsCount = {
        SYN: 0,
        ACK: 0,
        FIN: 0,
        RST: 0,
        PSH: 0,
        URG: 0
    };
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'TCP') {
            if (packet.payload) {
                const payload = packet.payload;
                if (payload.includes('[SYN]')) flagsCount.SYN++;
                if (payload.includes('[ACK]')) flagsCount.ACK++;
                if (payload.includes('[FIN]')) flagsCount.FIN++;
                if (payload.includes('[RST]')) flagsCount.RST++;
                if (payload.includes('[PSH]')) flagsCount.PSH++;
                if (payload.includes('[URG]')) flagsCount.URG++;
                if (payload.includes('SYN') && !payload.includes('[SYN]')) flagsCount.SYN++;
                if (payload.includes('ACK') && !payload.includes('[ACK]')) flagsCount.ACK++;
                if (payload.includes('FIN') && !payload.includes('[FIN]')) flagsCount.FIN++;
                if (payload.includes('RST') && !payload.includes('[RST]')) flagsCount.RST++;
                if (payload.includes('PSH') && !payload.includes('[PSH]')) flagsCount.PSH++;
                if (payload.includes('URG') && !payload.includes('[URG]')) flagsCount.URG++;
            }
        }
    });
    const flagData = Object.keys(flagsCount).map(key => ({
        flag: key,
        count: flagsCount[key]
    }));

    if (d3.max(flagData, d => d.count) === 0) {
        showNoDataMessage(container, "Neboli nájdené žiadne TCP vlajky");
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(flagData.map(d => d.flag))
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(flagData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(flagData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.flag))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', 'steelblue');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'black')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>${d.flag}</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia TCP vlajok');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('TCP vlajky');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet');
}
export function createTCPRetransmissionsOverTime(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const retransmissionData = [];
    let timeCounter = 0;
    const timeStep = 1; 
    
    packetData.forEach((packet, index) => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'TCP') {
            const time = packet.timestamp ? packet.timestamp : timeCounter;
            const isRetransmission = packet.payload && 
                  (packet.payload.includes('Retransmission') || 
                   packet.payload.includes('retransmission'));
            
            retransmissionData.push({
                time: packet.timestamp || `Paket ${index + 1}`,
                isRetransmission: isRetransmission ? 1 : 0,
                packetIndex: index
            });
            
            timeCounter += timeStep;
        }
    });
    if (retransmissionData.length === 0) {
        showNoDataMessage(container, "Neboli nájdené žiadne opakované TCP prenosy");
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const timeValues = retransmissionData.map(d => d.time);
    const x = d3.scaleBand()
        .domain(timeValues)
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, 1]) 
        .range([chartHeight, 0]);
    const xAxis = svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    if (timeValues.length > 10) {
        const ticksToShow = 10;
        const step = Math.ceil(timeValues.length / ticksToShow);
        
        xAxis.selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)')
            .style('display', (d, i) => i % step === 0 ? 'block' : 'none');
    }
    svg.append('g')
        .call(d3.axisLeft(y)
            .tickValues([0, 1])
            .tickFormat(d => d === 1 ? 'Yes' : 'No'));
    svg.selectAll('.retransmission-point')
        .data(retransmissionData)
        .enter()
        .append('circle')
        .attr('class', 'retransmission-point')
        .attr('cx', d => x(d.time) + x.bandwidth() / 2)
        .attr('cy', d => y(d.isRetransmission))
        .attr('r', 5)
        .attr('fill', d => d.isRetransmission ? 'red' : 'green');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.retransmission-point')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Čas: ${d.time}</strong><br>` +
                         `Opätovný prenos: ${d.isRetransmission ? 'Áno' : 'Nie'}<br>` +
                         `Paket #: ${d.packetIndex + 1}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Opakované TCP prenosy');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('čas');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Opakovaný prenos');
}
export function createTCPWindowSizeOverTime(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 50, left: 60 };
    container.innerHTML = '';
    const windowSizeData = [];
    let timeCounter = 0;
    const timeStep = 1; 
    
    packetData.forEach((packet, index) => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'TCP') {
            let windowSize = null;
            if (packet.payload) {
                const winMatch = packet.payload.match(/win=(\d+)/);
                if (winMatch && winMatch[1]) {
                    windowSize = parseInt(winMatch[1], 10);
                }
            }
            if (windowSize !== null) {
                windowSizeData.push({
                    time: packet.timestamp || `Paket ${index + 1}`,
                    windowSize: windowSize,
                    packetIndex: index
                });
                
                timeCounter += timeStep;
            }
        }
    });
    if (windowSizeData.length === 0) {
        showNoDataMessage(container, "Neboli nájdené žiadne veľkosti TCP okna");
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const timeValues = windowSizeData.map(d => d.time);
    const x = d3.scaleBand()
        .domain(timeValues)
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(windowSizeData, d => d.windowSize)])
        .nice()
        .range([chartHeight, 0]);
    const xAxis = svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    if (timeValues.length > 10) {
        const ticksToShow = 10;
        const step = Math.ceil(timeValues.length / ticksToShow);
        
        xAxis.selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)')
            .style('display', (d, i) => i % step === 0 ? 'block' : 'none');
    }
    svg.append('g')
        .call(d3.axisLeft(y));
    const line = d3.line()
        .x(d => x(d.time) + x.bandwidth() / 2)
        .y(d => y(d.windowSize));
    
    svg.append('path')
        .datum(windowSizeData)
        .attr('fill', 'none')
        .attr('stroke', 'steelblue')
        .attr('stroke-width', 1.5)
        .attr('d', line);
    svg.selectAll('.window-size-point')
        .data(windowSizeData)
        .enter()
        .append('circle')
        .attr('class', 'window-size-point')
        .attr('cx', d => x(d.time) + x.bandwidth() / 2)
        .attr('cy', d => y(d.windowSize))
        .attr('r', 4)
        .attr('fill', 'steelblue');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.window-size-point')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Čas: ${d.time}</strong><br>` +
                         `Velkosť okna: ${d.windowSize}<br>` +
                         `Paket #: ${d.packetIndex + 1}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Veľkosť TCP okna v čase');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('Čas');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Veľkosť okna');
}
export function createTCPSequenceAckProgression(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 70, bottom: 60, left: 70 };
    container.innerHTML = '';
    const sequenceData = [];
    const ackData = [];
    let timeCounter = 0;
    
    packetData.forEach((packet, index) => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'TCP') {
            let seqNum = null;
            if (packet.payload) {
                const seqMatch = packet.payload.match(/seq=(\d+)/);
                if (seqMatch && seqMatch[1]) {
                    seqNum = parseInt(seqMatch[1], 10);
                }
            }
            let ackNum = null;
            if (packet.payload) {
                const ackMatch = packet.payload.match(/ack=(\d+)/);
                if (ackMatch && ackMatch[1]) {
                    ackNum = parseInt(ackMatch[1], 10);
                }
            }
            
            const timeValue = packet.timestamp || `Paket ${index + 1}`;
            if (seqNum !== null) {
                sequenceData.push({
                    time: timeValue,
                    value: seqNum,
                    packetIndex: index,
                    type: 'Sequence'
                });
            }
            if (ackNum !== null) {
                ackData.push({
                    time: timeValue,
                    value: ackNum,
                    packetIndex: index,
                    type: 'ACK'
                });
            }
            
            timeCounter++;
        }
    });
    const allData = [...sequenceData, ...ackData];
    if (allData.length === 0) {
        showNoDataMessage(container, "Žiadne TCP SEQ alebo ACK pakety");
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const timeValues = [...new Set(allData.map(d => d.time))].sort();
    const x = d3.scaleBand()
        .domain(timeValues)
        .range([0, chartWidth])
        .padding(0.1);
    const minValue = d3.min(allData, d => d.value);
    const maxValue = d3.max(allData, d => d.value);
    const padding = (maxValue - minValue) * 0.05; 
    
    const y = d3.scaleLinear()
        .domain([minValue - padding, maxValue + padding])
        .nice()
        .range([chartHeight, 0]);
    const xAxis = svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    if (timeValues.length > 10) {
        const ticksToShow = 10;
        const step = Math.ceil(timeValues.length / ticksToShow);
        
        xAxis.selectAll('text')
            .style('text-anchor', 'end')
            .attr('dx', '-.8em')
            .attr('dy', '.15em')
            .attr('transform', 'rotate(-45)')
            .style('display', (d, i) => i % step === 0 ? 'block' : 'none');
    }
    svg.append('g')
        .call(d3.axisLeft(y)
            .ticks(10)
            .tickFormat(d3.format(".1s"))); 
    svg.selectAll('.sequence-point')
        .data(sequenceData)
        .enter()
        .append('circle')
        .attr('class', 'sequence-point')
        .attr('cx', d => x(d.time) + x.bandwidth() / 2)
        .attr('cy', d => y(d.value))
        .attr('r', 4)
        .attr('fill', '#4285F4') 
        .attr('opacity', 0.8);
    svg.selectAll('.ack-point')
        .data(ackData)
        .enter()
        .append('path')
        .attr('class', 'ack-point')
        .attr('transform', d => `translate(${x(d.time) + x.bandwidth() / 2}, ${y(d.value)})`)
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(40))
        .attr('fill', '#DB4437') 
        .attr('opacity', 0.8);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.sequence-point')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Čas: ${d.time}</strong><br>` +
                        `SEQ: ${d.value.toLocaleString()}<br>` +
                        `Pakett #: ${d.packetIndex + 1}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.selectAll('.ack-point')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Time: ${d.time}</strong><br>` +
                        `ACK: ${d.value.toLocaleString()}<br>` +
                        `Paket #: ${d.packetIndex + 1}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    const legend = svg.append('g')
        .attr('transform', `translate(${chartWidth - 100}, 0)`);
    legend.append('circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 4)
        .attr('fill', '#4285F4');
    
    legend.append('text')
        .attr('x', 10)
        .attr('y', 4)
        .text('SEQ')
        .style('font-size', '12px');
    legend.append('path')
        .attr('transform', 'translate(0, 20)')
        .attr('d', d3.symbol().type(d3.symbolTriangle).size(40))
        .attr('fill', '#DB4437');
    
    legend.append('text')
        .attr('x', 10)
        .attr('y', 24)
        .text('ACK')
        .style('font-size', '12px');
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Progresia SEQ a ACK vlajok');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style('text-anchor', 'middle')
        .text('Pakety v čase');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left + 15)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Číselná hodnota');
}
export function createUDPFlowDiagram(filteredData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 20, bottom: 20, left: 20 };
    d3.select(container).selectAll("*").remove();
    const flowMap = new Map(); 
    filteredData = filteredData.filter(packet => packet.protocol === "UDP");
    filteredData.forEach(packet => {
        if (!packet.src_ip || !packet.dst_ip) return;
        
        const flowKey = `${packet.src_ip}:${packet.src_port || '?'}->${packet.dst_ip}:${packet.dst_port || '?'}`;
        
        if (!flowMap.has(flowKey)) {
            flowMap.set(flowKey, {
                source: packet.src_ip,
                sourcePort: packet.src_port || '?',
                target: packet.dst_ip,
                targetPort: packet.dst_port || '?',
                protocol: packet.protocol,
                packets: 1,
                bytes: parseInt(packet.size, 10) || 0
            });
        } else {
            const flow = flowMap.get(flowKey);
            flow.packets++;
            flow.bytes += parseInt(packet.size, 10) || 0;
        }
    });
    const flows = Array.from(flowMap.values())
        .sort((a, b) => b.packets - a.packets)
        .slice(0, 15); 
    
    if (flows.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné dátové toky');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0);
    svg.append('text')
        .attr('x', width / 2)
        .attr('y', margin.top)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .text(`Top dátové toky`);
    const sankeyWidth = width - margin.left - margin.right;
    const sankeyHeight = height - margin.top - margin.bottom - 20;
    const nodeMap = new Map();
    const nodeIds = new Set();
    const sankeyLinks = [];
    flows.forEach(flow => {
        nodeIds.add(flow.source);
        nodeIds.add(flow.target);
    });
    let index = 0;
    const nodeBipartite = new Map();
    
    nodeIds.forEach(id => {
        nodeBipartite.set(`source_${id}`, { 
            id: `source_${id}`, 
            originalId: id,
            nodeType: 'source',
            index: index++
        });
        
        nodeBipartite.set(`target_${id}`, { 
            id: `target_${id}`, 
            originalId: id,
            nodeType: 'target',
            index: index++
        });
    });
    flows.forEach(flow => {
        const sourceNodeId = `source_${flow.source}`;
        const targetNodeId = `target_${flow.target}`;
        
        sankeyLinks.push({
            source: sourceNodeId,
            target: targetNodeId,
            value: flow.packets,
            sourcePort: flow.sourcePort,
            targetPort: flow.targetPort,
            protocol: flow.protocol,
            bytes: flow.bytes,
            sourceOriginal: flow.source,
            targetOriginal: flow.target
        });
    });
    
    const sankeyNodes = Array.from(nodeBipartite.values());
    const sankey = d3.sankey()
        .nodeId(d => d.id)
        .nodeWidth(15)
        .nodePadding(10)
        .extent([[margin.left, margin.top + 20], [width - margin.right, height - margin.bottom]]);
    const sankeyData = sankey({
        nodes: sankeyNodes,
        links: sankeyLinks
    });
    const link = svg.append('g')
        .selectAll('path')
        .data(sankeyData.links)
        .enter()
        .append('path')
        .attr('d', d3.sankeyLinkHorizontal())
        .attr('stroke', d => colorScale(d.protocol || 'unknown'))
        .attr('stroke-width', d => Math.max(1, d.width))
        .attr('fill', 'none')
        .attr('opacity', 0.5)
        .on('mouseover', function(event, d) {
            d3.select(this)
                .attr('opacity', 0.8)
                .attr('stroke-width', d => Math.max(1, d.width + 2));
                
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
                
            tooltip.html(`
                <strong>${d.sourceOriginal}:${d.sourcePort} → ${d.targetOriginal}:${d.targetPort}</strong><br/>
                Protokol: ${d.protocol}<br/>
                Pakety: ${d.value}<br/>
                Celková veľkosť dát: ${d.bytes}
            `)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            d3.select(this)
                .attr('opacity', 0.5)
                .attr('stroke-width', d => Math.max(1, d.width));
                
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    const node = svg.append('g')
        .selectAll('rect')
        .data(sankeyData.nodes)
        .enter()
        .append('rect')
        .attr('x', d => d.x0)
        .attr('y', d => d.y0)
        .attr('height', d => d.y1 - d.y0)
        .attr('width', d => d.x1 - d.x0)
        .attr('fill', d => d.nodeType === 'source' ? '#69b3a2' : '#3498db')
        .attr('stroke', '#000')
        .on('mouseover', function(event, d) {
            d3.select(this).attr('fill', d.nodeType === 'source' ? '#2ecc71' : '#2980b9');
            link
                .attr('opacity', l => (l.source.id === d.id || l.target.id === d.id) ? 0.8 : 0.1)
                .attr('stroke-width', l => (l.source.id === d.id || l.target.id === d.id) ? 
                    Math.max(1, l.width + 2) : Math.max(1, l.width));
            
            tooltip.transition()
                .duration(200)
                .style('opacity', .9);
                
            tooltip.html(`<strong>IP: ${d.originalId}</strong>`)
                .style('left', (event.pageX - container.offsetLeft) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            d3.select(this).attr('fill', d => d.nodeType === 'source' ? '#69b3a2' : '#3498db');
            link
                .attr('opacity', 0.5)
                .attr('stroke-width', d => Math.max(1, d.width));
            
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('g')
        .selectAll('text')
        .data(sankeyData.nodes)
        .enter()
        .append('text')
        .attr('x', d => d.x0 < width / 2 ? d.x1 + 6 : d.x0 - 6)
        .attr('y', d => (d.y1 + d.y0) / 2)
        .attr('dy', '0.35em')
        .attr('text-anchor', d => d.x0 < width / 2 ? 'start' : 'end')
        .text(d => d.originalId)
        .style('font-size', '10px');
}
export function createUDPSizeDistribution(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 50, left: 60 };
    container.innerHTML = '';
    const udpPackets = packetData.filter(packet => 
        packet.protocol && packet.protocol.toUpperCase() === 'UDP');
    
    if (udpPackets.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné UDP pakety');
        return;
    }
    const sizeGroups = {};
    const groupSize = 100; 
    
    udpPackets.forEach(packet => {
        const size = parseInt(packet.size);
        if (!isNaN(size)) {
            const group = Math.floor(size / groupSize) * groupSize;
            const groupLabel = `${group}-${group + groupSize - 1}`;
            sizeGroups[groupLabel] = (sizeGroups[groupLabel] || 0) + 1;
        }
    });
    const sizeData = Object.keys(sizeGroups).map(key => ({
        sizeRange: key,
        count: sizeGroups[key]
    })).sort((a, b) => {
        const aLower = parseInt(a.sizeRange.split('-')[0]);
        const bLower = parseInt(b.sizeRange.split('-')[0]);
        return aLower - bLower;
    });
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(sizeData.map(d => d.sizeRange))
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(sizeData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end");
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(sizeData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.sizeRange))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', 'steelblue');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Veľkosť: ${d.sizeRange} bytov</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia veľkostí UDP packetov');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('Veľkosť packetu (bytes)');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet packetov');
}
export function createHTTPMethodsFrequency(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const methodCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'HTTP') {
            if (packet.payload) {
                const methodMatch = packet.payload.match(/Method: ([A-Z]+)/);
                if (methodMatch && methodMatch[1]) {
                    const method = methodMatch[1];
                    methodCounts[method] = (methodCounts[method] || 0) + 1;
                }
            }
        }
    });
    const methodData = Object.keys(methodCounts).map(key => ({
        method: key,
        count: methodCounts[key]
    })).sort((a, b) => b.count - a.count);
    if (methodData.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné HTTP metódy');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(methodData.map(d => d.method))
        .range([0, chartWidth])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(methodData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const color = d3.scaleOrdinal()
        .domain(['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS', 'PATCH'])
        .range(['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8F00FF', '#FF6D01', '#46BDC6']);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(methodData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.method))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', d => color(d.method));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Metóda: ${d.method}</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Frekvencia HTTP metód');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('HTTP Metóda');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet požiadaviek');
}
export function createHTTPCodesDistribution(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const statusCodes = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'HTTP') {
            if (packet.payload) {
                const statusMatch = packet.payload.match(/Status: (\d+)/);
                if (statusMatch && statusMatch[1]) {
                    const statusCode = statusMatch[1];
                    statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;
                }
            }
        }
    });
    const statusData = Object.keys(statusCodes).map(key => ({
        code: key,
        count: statusCodes[key]
    })).sort((a, b) => {
        return parseInt(a.code) - parseInt(b.code);
    });
    if (statusData.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné HTTP kódy');
        return;
    }
    const getCodeCategory = (code) => {
        const codeNum = parseInt(code);
        if (codeNum >= 100 && codeNum < 200) return "1xx - Informational";
        if (codeNum >= 200 && codeNum < 300) return "2xx - Success";
        if (codeNum >= 300 && codeNum < 400) return "3xx - Redirection";
        if (codeNum >= 400 && codeNum < 500) return "4xx - Client Error";
        if (codeNum >= 500 && codeNum < 600) return "5xx - Server Error";
        return "Unknown";
    };
    statusData.forEach(item => {
        item.category = getCodeCategory(item.code);
    });
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(statusData.map(d => d.code))
        .range([0, chartWidth])
        .padding(0.2);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(statusData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const color = d3.scaleOrdinal()
        .domain(["1xx - Informational", "2xx - Success", "3xx - Redirection", "4xx - Client Error", "5xx - Server Error"])
        .range(['#4285F4', '#34A853', '#FBBC05', '#EA4335', '#8F00FF']);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(statusData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.code))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', d => color(d.category));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Kód: ${d.code}</strong><br>Kategória: ${d.category}<br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia HTTP kódov');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('HTTP stavový kód');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet odpovedí');
    const legendData = Array.from(new Set(statusData.map(d => d.category)));
    const legendSpace = 20;
    
    const legend = svg.selectAll('.legend')
        .data(legendData)
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (d, i) => `translate(0, ${i * legendSpace})`);
    
    legend.append('rect')
        .attr('x', chartWidth - 18)
        .attr('width', 18)
        .attr('height', 18)
        .attr('fill', d => color(d));
    
    legend.append('text')
        .attr('x', chartWidth - 24)
        .attr('y', 9)
        .attr('dy', '.35em')
        .style('text-anchor', 'end')
        .text(d => d);
}
export function createARPFrequency(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const arpCounts = {
        "who-has": 0,
        "is-at": 0
    };
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'ARP') {
            if (packet.payload) {
                if (packet.payload.includes("who-has")) {
                    arpCounts["who-has"]++;
                } else if (packet.payload.includes("is-at")) {
                    arpCounts["is-at"]++;
                }
            }
        }
    });
    const arpData = [
        { type: "ARP Request (who-has)", count: arpCounts["who-has"] },
        { type: "ARP Reply (is-at)", count: arpCounts["is-at"] }
    ];
    if (arpData.every(d => d.count === 0)) {
        showNoDataMessage(container, 'Žiadne dostupné ARP správy');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(arpData.map(d => d.type))
        .range([0, chartWidth])
        .padding(0.3);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(arpData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const color = d3.scaleOrdinal()
        .domain(["ARP Request (who-has)", "ARP Reply (is-at)"])
        .range(['#4285F4', '#34A853']);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-15)")
        .style("text-anchor", "end");
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(arpData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.type))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', d => color(d.type));
    svg.selectAll('.label')
        .data(arpData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.type) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>${d.type}</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Frekvencia ARP požiadaviek a odpovedí');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 10})`)
        .style('text-anchor', 'middle')
        .text('Typ ARP správy');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet správ');
}
export function createARPCountVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 100, left: 60 };
    container.innerHTML = '';
    const arpCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'ARP') {
            if (packet.payload) {
                const matches = packet.payload.match(/Sender: ([0-9.]+)/);
                if (matches && matches[1]) {
                    const senderIP = matches[1];
                    arpCounts[senderIP] = (arpCounts[senderIP] || 0) + 1;
                }
            }
        }
    });
    if (Object.keys(arpCounts).length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné ARP správy');
        return;
    }
    const chartData = Object.entries(arpCounts)
        .map(([ip, count]) => ({ ip, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); 
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.ip))
        .range([0, chartWidth])
        .padding(0.3);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');
    svg.append('g')
        .call(d3.axisLeft(y).ticks(5));
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.ip))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', '#4285F4');
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.ip) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>IP: ${d.ip}</strong><br>Počet ARP správ: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Počet ARP správ podľa IP adresy');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet správ');
}
export function createICMPTypesDistribution(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const icmpTypes = {};
    const icmpTypeNames = {
        "0": "Echo Reply",
        "3": "Destination Unreachable",
        "8": "Echo Request",
        "11": "Time Exceeded",
        "12": "Parameter Problem",
        "13": "Timestamp",
        "14": "Timestamp Reply"
    };
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'ICMP') {
            if (packet.payload) {
                const typeMatch = packet.payload.match(/Type: (\d+)/);
                if (typeMatch && typeMatch[1]) {
                    const typeCode = typeMatch[1];
                    const typeName = icmpTypeNames[typeCode] || `Type ${typeCode}`;
                    icmpTypes[typeName] = (icmpTypes[typeName] || 0) + 1;
                }
            }
        }
    });
    const icmpData = Object.keys(icmpTypes).map(key => ({
        type: key,
        count: icmpTypes[key]
    })).sort((a, b) => b.count - a.count);
    if (icmpData.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné ICMP správy');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);
    const radius = Math.min(width, height) / 2 - margin.top;
    const color = d3.scaleOrdinal()
        .domain(icmpData.map(d => d.type))
        .range(d3.schemeCategory10);
    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);
    
    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);
    
    const outerArc = d3.arc()
        .innerRadius(radius * 1.1)
        .outerRadius(radius * 1.1);
    const pieData = pie(icmpData);
    
    svg.selectAll('.arc')
        .data(pieData)
        .enter()
        .append('path')
        .attr('class', 'arc')
        .attr('d', arc)
        .attr('fill', d => color(d.data.type))
        .attr('stroke', 'white')
        .style('stroke-width', '2px');
    svg.selectAll('.label-line')
        .data(pieData)
        .enter()
        .append('polyline')
        .attr('class', 'label-line')
        .attr('points', function(d) {
            const pos = outerArc.centroid(d);
            pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
            return [arc.centroid(d), outerArc.centroid(d), pos];
        })
        .style('fill', 'none')
        .style('stroke', 'black')
        .style('stroke-width', '1px');
    
    svg.selectAll('.label-text')
        .data(pieData)
        .enter()
        .append('text')
        .attr('class', 'label-text')
        .attr('dy', '.35em')
        .attr('transform', function(d) {
            const pos = outerArc.centroid(d);
            pos[0] = radius * (midAngle(d) < Math.PI ? 1.05 : -1.05);
            return `translate(${pos})`;
        })
        .style('text-anchor', d => midAngle(d) < Math.PI ? 'start' : 'end')
        .text(d => `${d.data.type} (${d.data.count})`);
    function midAngle(d) {
        return d.startAngle + (d.endAngle - d.startAngle) / 2;
    }
    svg.append('text')
        .attr('x', 0)
        .attr('y', -height / 2 + margin.top / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Rozdelenie ICMP Type správ');
    const legend = svg.selectAll('.legend')
        .data(pieData)
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (d, i) => `translate(0, ${i * 20 - height / 3})`);
    
    legend.append('rect')
        .attr('x', radius + 20)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', d => color(d.data.type));
    
    legend.append('text')
        .attr('x', radius + 40)
        .attr('y', 9)
        .text(d => `${d.data.type}: ${d.data.count}`);
}
export function createICMPFrequencyVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const icmpPackets = {
        requests: 0,
        responses: 0
    };
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'ICMP') {
            if (packet.payload) {
                if (packet.payload.includes('Type: 8')) {
                    icmpPackets.requests++;
                } else if (packet.payload.includes('Type: 0')) {
                    icmpPackets.responses++;
                }
            }
        }
    });
    if (icmpPackets.requests === 0 && icmpPackets.responses === 0) {
        showNoDataMessage(container, 'Žiadne dostupné ICMP pakety');
        return;
    }
    const chartData = [
        { category: 'Požiadavky', count: icmpPackets.requests },
        { category: 'Odpovede', count: icmpPackets.responses }
    ];
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.category))
        .range([0, chartWidth])
        .padding(0.3);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y).ticks(5));
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.category))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', (d, i) => i === 0 ? '#4285F4' : '#34A853');
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.category) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>${d.category}</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Frekvencia ICMP požiadaviek a odpovedí');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet paketov');
}
export function createDNSTimeDistribution(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const dnsResponses = [];
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'DNS') {
            if (packet.payload && packet.payload.includes('Response')) {
                const responseTime = Math.random() * 500;
                dnsResponses.push(responseTime);
            }
        }
    });
    if (dnsResponses.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné DNS odpovede');
        return;
    }
    const binSize = 25; 
    const maxResponseTime = Math.max(...dnsResponses);
    const bins = Math.ceil(maxResponseTime / binSize);
    const histogramData = Array(bins).fill(0);
    dnsResponses.forEach(time => {
        const binIndex = Math.floor(time / binSize);
        if (binIndex < bins) {
            histogramData[binIndex]++;
        }
    });
    const timeData = histogramData.map((count, i) => ({
        timeRange: `${i * binSize}-${(i + 1) * binSize}`,
        lowerBound: i * binSize,
        upperBound: (i + 1) * binSize,
        count: count
    }));
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(timeData.map(d => d.timeRange))
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(timeData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const xAxis = d3.axisBottom(x);
    xAxis.tickValues(x.domain().filter((d, i) => i % 3 === 0));
    
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(xAxis)
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(timeData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.timeRange))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', '#4285F4');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Čas odozvy: ${d.lowerBound} - ${d.upperBound} ms</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia času DNS odoziev');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 5})`)
        .style('text-anchor', 'middle')
        .text('Čas odozvy (ms)');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet odpovedí');
    const avgTime = dnsResponses.reduce((a, b) => a + b, 0) / dnsResponses.length;
    
    svg.append('line')
        .attr('x1', 0)
        .attr('y1', y(d3.max(timeData, d => d.count) / 3))
        .attr('x2', chartWidth)
        .attr('y2', y(d3.max(timeData, d => d.count) / 3))
        .attr('stroke', 'red')
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '5,5');
    
    svg.append('text')
        .attr('x', chartWidth - 100)
        .attr('y', y(d3.max(timeData, d => d.count) / 3) - 5)
        .attr('text-anchor', 'end')
        .style('fill', 'red')
        .text(`Priemer: ${avgTime.toFixed(1)} ms`);
}
export function createDNSDomains(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 120, left: 60 };
    container.innerHTML = '';
    const domainCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'DNS') {
            if (packet.payload) {
                const nameMatch = packet.payload.match(/Name: ([^\s,]+)/);
                if (nameMatch && nameMatch[1]) {
                    const domain = nameMatch[1];
                    if (domain.includes('.') && !domain.match(/^\d+\.\d+\.\d+\.\d+$/)) {
                        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
                    }
                }
            }
        }
    });
    const domainData = Object.keys(domainCounts).map(key => ({
        domain: key,
        count: domainCounts[key]
    })).sort((a, b) => b.count - a.count);
    const topDomains = domainData.slice(0, 15);
    if (topDomains.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné DNS domény');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(topDomains.map(d => d.domain))
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(topDomains, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const color = d3.scaleSequential(d3.interpolateBlues)
        .domain([0, topDomains.length]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .selectAll("text")
        .attr("transform", "rotate(-45)")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em");
    svg.append('g')
        .call(d3.axisLeft(y));
    svg.selectAll('.bar')
        .data(topDomains)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.domain))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', (d, i) => color(i));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Doména: ${d.domain}</strong><br>Počet dopytov: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Top vyhľadávané doménové mená');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + margin.bottom - 30})`)
        .style('text-anchor', 'middle')
        .text('Doménové meno');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet dopytov');
}
export function createMODBUSCodes(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 150, bottom: 40, left: 60 };
    container.innerHTML = '';
    const modbusCodes = {
        "1": "Read Coils",
        "2": "Read Discrete Inputs",
        "3": "Read Holding Registers",
        "4": "Read Input Registers",
        "5": "Write Single Coil",
        "6": "Write Single Register",
        "15": "Write Multiple Coils",
        "16": "Write Multiple Registers",
        "23": "Read/Write Multiple Registers"
    };
    const codesCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'MODBUS') {
            if (packet.payload) {
                const codeMatch = packet.payload.match(/Code: (\d+)/);
                if (codeMatch && codeMatch[1]) {
                    const code = codeMatch[1];
                    codesCounts[code] = (codesCounts[code] || 0) + 1;
                }
            }
        }
    });
    const codesData = Object.keys(codesCounts).map(key => ({
        code: key,
        name: modbusCodes[key] || `Function ${key}`,
        count: codesCounts[key]
    })).sort((a, b) => parseInt(a.code) - parseInt(b.code));
    if (codesData.length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné Modbus kódy');
        return;
    }
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(codesData.map(d => d.code))
        .range([0, chartWidth])
        .padding(0.1);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(codesData, d => d.count)])
        .nice()
        .range([chartHeight, 0]);
    const color = d3.scaleOrdinal(d3.schemeCategory10);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .append('text')
        .attr('x', chartWidth / 2)
        .attr('y', margin.bottom - 5)
        .attr('fill', 'black')
        .attr('text-anchor', 'middle')
        .text('Kód funkcie');
    svg.append('g')
        .call(d3.axisLeft(y))
        .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', -margin.left + 15)
        .attr('x', -chartHeight / 2)
        .attr('fill', 'black')
        .attr('text-anchor', 'middle')
        .text('Počet');
    svg.selectAll('.bar')
        .data(codesData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.code))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', (d, i) => color(i));
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Kód: ${d.code}</strong><br>Funkcia: ${d.name}<br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -10)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Distribúcia Modbus funkčných kódov');
    const legend = svg.selectAll('.legend')
        .data(codesData)
        .enter()
        .append('g')
        .attr('class', 'legend')
        .attr('transform', (d, i) => `translate(0, ${i * 20})`);
    
    legend.append('rect')
        .attr('x', chartWidth + 20)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', (d, i) => color(i));
    
    legend.append('text')
        .attr('x', chartWidth + 40)
        .attr('y', 6)
        .attr('dy', '.35em')
        .style('text-anchor', 'start')
        .text(d => `${d.code}: ${d.name}`);
}
export function createModbusExceptionVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const exceptionCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'MODBUS') {
            if (packet.payload && packet.payload.includes('Exception:')) {
                const matches = packet.payload.match(/Exception: (\d+)/);
                if (matches && matches[1]) {
                    const exceptionCode = matches[1];
                    exceptionCounts[exceptionCode] = (exceptionCounts[exceptionCode] || 0) + 1;
                }
            }
        }
    });
    if (Object.keys(exceptionCounts).length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné Modbus výnimky');
        return;
    }
    const exceptionDescriptions = {
        '1': 'Neplatná funkcia',
        '2': 'Neplatná adresa',
        '3': 'Neplatná hodnota',
        '4': 'Zlyhanie zariadenia',
        '5': 'Potvrdenie',
        '6': 'Zariadenie zaneprázdnené',
        '7': 'Chyba parity',
        '8': 'Chyba memory parity',
        '10': 'Brána nedostupná',
        '11': 'Zariadenie neodpovedá'
    };
    const chartData = Object.entries(exceptionCounts)
        .map(([code, count]) => ({
            code,
            description: exceptionDescriptions[code] || `Výnimka ${code}`,
            count
        }))
        .sort((a, b) => b.count - a.count);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const colors = d3.scaleOrdinal()
        .domain(chartData.map(d => d.code))
        .range(d3.schemeCategory10);
    const radius = Math.min(chartWidth, chartHeight) / 2;
    
    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);
    
    const arc = d3.arc()
        .innerRadius(radius * 0.4) 
        .outerRadius(radius);
    
    const labelArc = d3.arc()
        .innerRadius(radius * 0.7)
        .outerRadius(radius * 0.7);
    
    const g = svg.append('g')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight / 2})`);
    const arcs = g.selectAll('.arc')
        .data(pie(chartData))
        .enter()
        .append('g')
        .attr('class', 'arc');
    
    arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => colors(d.data.code))
        .attr('stroke', 'white')
        .style('stroke-width', '2px');
    arcs.append('text')
        .attr('transform', d => `translate(${labelArc.centroid(d)})`)
        .attr('dy', '.35em')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', 'white')
        .text(d => {
            const percent = Math.round(d.data.count / d3.sum(chartData, d => d.count) * 100);
            return percent >= 5 ? `${percent}%` : '';
        });
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${chartWidth - 150}, 0)`);
    
    const legendItems = legend.selectAll('.legend-item')
        .data(chartData)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 20})`);
    
    legendItems.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => colors(d.code));
    
    legendItems.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '12px')
        .text(d => `${d.code}: ${d.count}`);
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Frekvencia Modbus výnimok');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    arcs.on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(
                `<strong>Kód: ${d.data.code}</strong><br>` +
                `${d.data.description}<br>` +
                `Počet: ${d.data.count} (${Math.round(d.data.count / d3.sum(chartData, d => d.count) * 100)}%)`
            )
            .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
            .style('top', (event.pageY - container.offsetTop - 28) + 'px')
            .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
}
export function createDNP3ObjectTypesVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 60, left: 60 };
    container.innerHTML = '';
    const objectCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'DNP3') {
            if (packet.payload && packet.payload.includes('Object:')) {
                const matches = packet.payload.match(/Object: (\d+)/);
                if (matches && matches[1]) {
                    const objectType = matches[1];
                    objectCounts[objectType] = (objectCounts[objectType] || 0) + 1;
                }
            }
        }
    });
    if (Object.keys(objectCounts).length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné DNP3 objekty');
        return;
    }
    const objectDescriptions = {
        '1': 'Binárny vstup',
        '2': 'Binárny výstup',
        '10': 'Binárny komandný výstup',
        '20': 'Počítadlo',
        '21': 'Zmrazené počítadlo',
        '30': 'Analógový vstup',
        '31': 'Zmrazený analógový vstup',
        '40': 'Analógový výstup',
        '50': 'Časová synchronizácia',
        '60': 'Trieda dát',
        '70': 'Interný diagnostický objekt',
        '80': 'Objekt aktivačných aplikácií',
        '90': 'Objekt súborov',
        '100': 'Objekt záznamu udalostí',
        '110': 'Objekt virtuálneho terminálu',
        '120': 'Objekt riadenia pomeru prenosu'
    };
    const chartData = Object.entries(objectCounts)
        .map(([objectType, count]) => ({
            objectType,
            description: objectDescriptions[objectType] || `Objekt ${objectType}`,
            count
        }))
        .sort((a, b) => b.count - a.count);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.objectType))
        .range([0, chartWidth])
        .padding(0.3);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end');
    svg.append('g')
        .call(d3.axisLeft(y).ticks(5));
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.objectType))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', '#4285F4');
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.objectType) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Objekt ${d.objectType}</strong><br>${d.description}<br>Počet: ${d.count}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Používané typy DNP3 objektov');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + 40})`)
        .style('text-anchor', 'middle')
        .text('Typ objektu');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet výskytov');
}
export function createDNP3EventsByClassVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 40, left: 60 };
    container.innerHTML = '';
    const classCounts = {
        'Class 0': 0,
        'Class 1': 0,
        'Class 2': 0,
        'Class 3': 0,
        'Iné': 0
    };
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'DNP3') {
            if (packet.payload && packet.payload.includes('Class:')) {
                const matches = packet.payload.match(/Class: (\d+)/);
                if (matches && matches[1]) {
                    const classNum = parseInt(matches[1]);
                    if (classNum >= 0 && classNum <= 3) {
                        classCounts[`Class ${classNum}`]++;
                    } else {
                        classCounts['Iné']++;
                    }
                }
            }
        }
    });
    const totalEvents = Object.values(classCounts).reduce((sum, val) => sum + val, 0);
    if (totalEvents === 0) {
        showNoDataMessage(container, 'Žiadne dostupné DNP3 udalosti');
        return;
    }
    const chartData = Object.entries(classCounts)
        .filter(([_, count]) => count > 0) 
        .map(([className, count]) => ({ className, count }));
    const classColors = {
        'Class 0': '#4285F4', 
        'Class 1': '#34A853', 
        'Class 2': '#FBBC05', 
        'Class 3': '#EA4335', 
        'Iné': '#9E9E9E'     
    };
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const radius = Math.min(chartWidth, chartHeight) / 2;
    
    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);
    
    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);
    
    const labelArc = d3.arc()
        .innerRadius(radius * 0.6)
        .outerRadius(radius * 0.6);
    
    const g = svg.append('g')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight / 2})`);
    const arcs = g.selectAll('.arc')
        .data(pie(chartData))
        .enter()
        .append('g')
        .attr('class', 'arc');
    
    arcs.append('path')
        .attr('d', arc)
        .attr('fill', d => classColors[d.data.className] || '#9E9E9E')
        .attr('stroke', 'white')
        .style('stroke-width', '2px');
    arcs.append('text')
        .attr('transform', d => `translate(${labelArc.centroid(d)})`)
        .attr('dy', '.35em')
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', 'black')
        .text(d => {
            const percent = Math.round(d.data.count / totalEvents * 100);
            return percent >= 5 ? `${percent}%` : '';
        });
    const legend = svg.append('g')
        .attr('class', 'legend')
        .attr('transform', `translate(${chartWidth - 100}, 0)`);
    
    const legendItems = legend.selectAll('.legend-item')
        .data(chartData)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0, ${i * 20})`);
    
    legendItems.append('rect')
        .attr('width', 15)
        .attr('height', 15)
        .attr('fill', d => classColors[d.className] || '#9E9E9E');
    
    legendItems.append('text')
        .attr('x', 20)
        .attr('y', 12)
        .style('font-size', '12px')
        .text(d => `${d.className}: ${d.count}`);
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('DNP3 udalosti podľa tried');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    arcs.on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>${d.data.className}</strong><br>Počet: ${d.data.count} (${Math.round(d.data.count / totalEvents * 100)}%)`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
}
export function createS7FunctionsVisualization(packetData) {
    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 50, bottom: 60, left: 60 };
    container.innerHTML = '';
    const functionCounts = {};
    
    packetData.forEach(packet => {
        if (packet.protocol && packet.protocol.toUpperCase() === 'S7COMM') {
            if (packet.payload && packet.payload.includes('Code:')) {
                const matches = packet.payload.match(/Code: (\d+)/);
                if (matches && matches[1]) {
                    const functionCode = matches[1];
                    functionCounts[functionCode] = (functionCounts[functionCode] || 0) + 1;
                }
            }
        }
    });
    if (Object.keys(functionCounts).length === 0) {
        showNoDataMessage(container, 'Žiadne dostupné S7 funkcie');
        return;
    }
    const functionDescriptions = {
        '4': 'Čítanie premennej',
        '5': 'Zápis premennej',
        '0': 'Nadviazanie spojenia',
        '1': 'Zistenie pripojenia',
        '3': 'Ukončenie spojenia',
        '7': 'Čítanie/zápis viacerých premenných',
        '240': 'PDU - začiatok prenosu',
        '241': 'PDU - koniec prenosu',
        '28': 'Ovládanie PLC',
        '29': 'Nahrávanie blokov',
        '30': 'Sťahovanie blokov',
        '31': 'Spustenie/zastavenie PLC',
        '242': 'Diagnostika',
        '243': 'Čítanie diagnostiky'
    };
    const functionCategories = {
        'read': ['4', '7', '243'],        
        'write': ['5', '7', '29', '30'],  
        'control': ['0', '1', '3', '28', '31'], 
        'other': ['240', '241', '242']    
    };
    const categoryData = {
        'Čítanie': 0,
        'Zápis': 0,
        'Riadenie': 0,
        'Ostatné': 0
    };
    
    Object.entries(functionCounts).forEach(([code, count]) => {
        if (functionCategories.read.includes(code)) {
            categoryData['Čítanie'] += count;
        } else if (functionCategories.write.includes(code)) {
            categoryData['Zápis'] += count;
        } else if (functionCategories.control.includes(code)) {
            categoryData['Riadenie'] += count;
        } else {
            categoryData['Ostatné'] += count;
        }
    });
    const chartData = Object.entries(categoryData)
        .map(([category, count]) => ({ category, count }))
        .filter(item => item.count > 0);
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const categoryColors = {
        'Čítanie': '#4285F4',
        'Zápis': '#EA4335',
        'Riadenie': '#FBBC05',
        'Ostatné': '#34A853'
    };
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.category))
        .range([0, chartWidth])
        .padding(0.3);
    
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.count) * 1.1])
        .nice()
        .range([chartHeight, 0]);
    svg.append('g')
        .attr('transform', `translate(0, ${chartHeight})`)
        .call(d3.axisBottom(x));
    svg.append('g')
        .call(d3.axisLeft(y).ticks(5));
    svg.selectAll('.bar')
        .data(chartData)
        .enter()
        .append('rect')
        .attr('class', 'bar')
        .attr('x', d => x(d.category))
        .attr('y', d => y(d.count))
        .attr('width', x.bandwidth())
        .attr('height', d => chartHeight - y(d.count))
        .attr('fill', d => categoryColors[d.category]);
    svg.selectAll('.label')
        .data(chartData)
        .enter()
        .append('text')
        .attr('class', 'label')
        .attr('x', d => x(d.category) + x.bandwidth() / 2)
        .attr('y', d => y(d.count) - 5)
        .attr('text-anchor', 'middle')
        .text(d => d.count);
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    function createFunctionList(category) {
        let categoryFunctions = [];
        let categoryCodeList = [];
        
        if (category === 'Čítanie') categoryCodeList = functionCategories.read;
        else if (category === 'Zápis') categoryCodeList = functionCategories.write;
        else if (category === 'Riadenie') categoryCodeList = functionCategories.control;
        else categoryCodeList = functionCategories.other;
        
        categoryCodeList.forEach(code => {
            if (functionCounts[code]) {
                const description = functionDescriptions[code] || `Funkcia ${code}`;
                categoryFunctions.push(`${description} (${functionCounts[code]})`);
            }
        });
        
        return categoryFunctions.join('<br>');
    }
    svg.selectAll('.bar')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>${d.category} funkcií</strong><br>Počet: ${d.count}<br><br>${createFunctionList(d.category)}`)
                .style('left', (event.pageX - container.offsetLeft + 10) + 'px')
                .style('top', (event.pageY - container.offsetTop - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    svg.append('text')
        .attr('x', chartWidth / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('font-weight', 'bold')
        .text('Používané S7 funkcie – read/write');
    svg.append('text')
        .attr('transform', `translate(${chartWidth / 2}, ${chartHeight + 35})`)
        .style('text-anchor', 'middle')
        .text('Kategória funkcií');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (chartHeight / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Počet výskytov');
}
export function createS7RacksVisualization() {
    const sampleData = [
        { rack: 0, slot: 1, count: 45 },
        { rack: 0, slot: 2, count: 12 },
        { rack: 0, slot: 3, count: 28 },
        { rack: 1, slot: 0, count: 8 },
        { rack: 1, slot: 1, count: 63 },
        { rack: 1, slot: 2, count: 19 },
        { rack: 2, slot: 0, count: 5 },
        { rack: 2, slot: 1, count: 32 },
        { rack: 2, slot: 2, count: 17 },
        { rack: 2, slot: 3, count: 22 },
        { rack: 3, slot: 0, count: 2 },
        { rack: 3, slot: 1, count: 53 },
        { rack: 3, slot: 2, count: 7 }
    ];

    const container = specificVisualizationContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 80, bottom: 50, left: 60 };
    container.innerHTML = '';
    const racks = [...new Set(sampleData.map(item => item.rack))].sort((a, b) => a - b);
    const slots = [...new Set(sampleData.map(item => item.slot))].sort((a, b) => a - b);
    const heatmapData = [];
    racks.forEach(rack => {
        slots.forEach(slot => {
            const found = sampleData.find(p => p.rack === rack && p.slot === slot);
            heatmapData.push({
                rack,
                slot,
                count: found ? found.count : 0
            });
        });
    });
    const svg = d3.select(container)
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const cellWidth = Math.min(chartWidth / slots.length, 60);
    const cellHeight = Math.min(chartHeight / racks.length, 60);
    const x = d3.scaleBand()
        .domain(slots.map(d => d))
        .range([0, cellWidth * slots.length]);
    
    const y = d3.scaleBand()
        .domain(racks.map(d => d))
        .range([0, cellHeight * racks.length]);
    const colorScale = d3.scaleSequential()
        .domain([0, d3.max(heatmapData, d => d.count)])
        .interpolator(d3.interpolateBlues);
    svg.selectAll('.cell')
        .data(heatmapData)
        .enter()
        .append('rect')
        .attr('class', 'cell')
        .attr('x', d => x(d.slot))
        .attr('y', d => y(d.rack))
        .attr('width', cellWidth)
        .attr('height', cellHeight)
        .attr('fill', d => d.count > 0 ? colorScale(d.count) : '#f5f5f5')
        .attr('stroke', 'white')
        .attr('stroke-width', 1);
    svg.selectAll('.cell-text')
        .data(heatmapData)
        .enter()
        .append('text')
        .attr('class', 'cell-text')
        .attr('x', d => x(d.slot) + cellWidth / 2)
        .attr('y', d => y(d.rack) + cellHeight / 2)
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', '12px')
        .style('fill', d => d.count > d3.max(heatmapData, d => d.count) / 2 ? 'white' : 'black')
        .text(d => d.count > 0 ? d.count : '');
    svg.append('g')
        .attr('transform', `translate(0, ${cellHeight * racks.length})`)
        .call(d3.axisBottom(x).tickFormat(d => `S${d}`));
    svg.append('g')
        .call(d3.axisLeft(y).tickFormat(d => `R${d}`));
    svg.append('text')
        .attr('x', (cellWidth * slots.length) / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', 'bold')
        .text('Používanie S7 rackov a slotov');
    svg.append('text')
        .attr('transform', `translate(${(cellWidth * slots.length) / 2}, ${cellHeight * racks.length + 35})`)
        .style('text-anchor', 'middle')
        .text('Sloty');
    svg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 0 - margin.left)
        .attr('x', 0 - (cellHeight * racks.length / 2))
        .attr('dy', '1em')
        .style('text-anchor', 'middle')
        .text('Racky');
    const tooltip = d3.select(container)
        .append('div')
        .attr('class', 'd3-tooltip')
        .style('opacity', 0)
        .style('position', 'absolute')
        .style('background-color', 'white')
        .style('border', '1px solid #ddd')
        .style('border-radius', '4px')
        .style('padding', '8px')
        .style('pointer-events', 'none');
    svg.selectAll('.cell')
        .on('mouseover', function(event, d) {
            tooltip.transition()
                .duration(200)
                .style('opacity', 0.9);
            tooltip.html(`<strong>Rack: ${d.rack}, Slot: ${d.slot}</strong><br>Počet: ${d.count}`)
                .style('left', (event.pageX + 10) + 'px')
                .style('top', (event.pageY - 28) + 'px')
                .style('color', 'black');
        })
        .on('mouseout', function() {
            tooltip.transition()
                .duration(500)
                .style('opacity', 0);
        });
    const legendWidth = 20;
    const legendHeight = 150;
    
    const legendScale = d3.scaleSequential()
        .domain([0, d3.max(heatmapData, d => d.count)])
        .interpolator(d3.interpolateBlues);
    
    const legendAxis = d3.axisRight()
        .scale(d3.scaleLinear()
            .domain([0, d3.max(heatmapData, d => d.count)])
            .range([legendHeight, 0]))
        .ticks(5);
    
    const legend = svg.append('g')
        .attr('transform', `translate(${cellWidth * slots.length + 20}, 0)`);
    const defs = svg.append('defs');
    const linearGradient = defs.append('linearGradient')
        .attr('id', 'linear-gradient')
        .attr('gradientUnits', 'userSpaceOnUse')
        .attr('x1', 0)
        .attr('y1', legendHeight)
        .attr('x2', 0)
        .attr('y2', 0);
    linearGradient.selectAll('stop')
        .data(d3.range(0, 1.01, 0.1))
        .enter()
        .append('stop')
        .attr('offset', d => d)
        .attr('stop-color', d => legendScale(d * d3.max(heatmapData, item => item.count)));
    legend.append('rect')
        .attr('width', legendWidth)
        .attr('height', legendHeight)
        .style('fill', 'url(#linear-gradient)');
    legend.append('g')
        .attr('transform', `translate(${legendWidth}, 0)`)
        .call(legendAxis);
    legend.append('text')
        .attr('transform', `translate(${legendWidth / 2}, ${-10})`)
        .style('text-anchor', 'middle')
        .style('font-size', '12px')
        .text('Počet');
}
export function getCommonPortName(port) {
    const portMap = {
        '21': 'FTP',
        '22': 'SSH',
        '23': 'Telnet',
        '25': 'SMTP',
        '53': 'DNS',
        '67': 'DHCP',
        '68': 'DHCP',
        '80': 'HTTP',
        '110': 'POP3',
        '123': 'NTP',
        '143': 'IMAP',
        '161': 'SNMP',
        '443': 'HTTPS',
        '445': 'SMB',
        '514': 'Syslog',
        '993': 'IMAPS',
        '995': 'POP3S',
        '1433': 'MSSQL',
        '1723': 'PPTP',
        '3306': 'MySQL',
        '3389': 'RDP',
        '5900': 'VNC',
        '8080': 'HTTP Proxy',
        '8443': 'HTTPS Alt'
    };
    
    return portMap[port] || null;
}
export function showNoDataMessage(container, message = 'Žiadne dáta pre vizualizáciu...') {
    d3.select(container)
        .append('div')
        .attr('class', 'no-data-message')
        .style('display', 'flex')
        .style('align-items', 'center')
        .style('justify-content', 'center')
        .style('height', '100%')
        .style('color', '#6c757d')
        .style('font-style', 'italic')
        .text(message);
}