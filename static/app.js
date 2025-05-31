import * as chartFunctions from './visualisations.js';
document.addEventListener('DOMContentLoaded', function() {
    let captureMode = null; 
    let packetCount = 0;
    let packetData = [];
    let table = null; 
    let socket = null; 
    let modeModal = null; 
    let selectedModeInModal = null; 
    let currentGeneralVisualization = 'protocol-distribution';
    let currentSpecificProtocol = 'all';
    let currentSpecificVisualization = 'port-distribution';
    const tableElement = document.getElementById('packetsTable');
    const startCaptureBtn = document.getElementById('startCaptureBtn');
    const stopCaptureBtn = document.getElementById('stopCaptureBtn');
    const interfaceSelector = document.getElementById('interfaceSelector'); 
    const displayFilterInput = document.getElementById('displayFilter'); 
    const pcapControlDiv = document.querySelector('.pcap-control');
    const interfaceControlDiv = document.querySelector('.interface-control');
    const currentPcapFileSpan = document.getElementById('currentPcapFile');
    const changePcapBtn = document.getElementById('changePcapBtn'); 
    const changeModeBtn = document.getElementById('changeModeBtn'); 
    const clearTableBtn = document.getElementById('clearTableBtn');
    const modeModalElement = document.getElementById('modeSelectionModal');
    const pcapOption = document.getElementById('pcapOption');
    const liveOption = document.getElementById('liveOption');
    const pcapFileInputContainer = document.getElementById('pcapFileInputContainer');
    const interfaceSelectContainer = document.getElementById('interfaceSelectContainer');
    const confirmModeBtn = document.getElementById('confirmModeBtn');
    const pcapFileInput = document.getElementById('pcapFileInput'); 
    const modalInterfaceSelector = document.getElementById('modalInterfaceSelector'); 
    const generalVisualizationType = document.getElementById('generalVisualizationType');
    const specificProtocolType = document.getElementById('specificProtocolType');
    const specificVisualizationType = document.getElementById('specificVisualizationType');
    const updateGeneralVisualizationBtn = document.getElementById('updateGeneralVisualizationBtn');
    const updateSpecificVisualizationBtn = document.getElementById('updateSpecificVisualizationBtn');
    const generalVisualizationContainer = document.getElementById('generalVisualizationContainer');
    const specificVisualizationContainer = document.getElementById('specificVisualizationContainer');
    
    try {
    table = new DataTable(tableElement, {
        order: [[0, 'desc']],
        paging: true,
        scrollY: true, 
        scrollCollapse: true,
        searching: false,
        info: false,
        lengthChange: false,
        pageLength: 21,
        language: {
            decimal: ",",
            thousands: ".",
            emptyTable: "Žiadne dáta v tabuľke",
            loadingRecords: "Načítavam...",
            processing: "Spracovávam...",
            search: "Hľadať:",
            zeroRecords: "Nenašli sa žiadne záznamy",
            paginate: {
                first: "Prvá",
                last: "Posledná",
                next: "Ďalšia",
                previous: "Predošlá"
            },
            aria: {
                sortAscending: ": aktivujte pre zoradenie vzostupne",
                sortDescending: ": aktivujte pre zoradenie zostupne"
            }
        },
        columns: [
            { data: 'timestamp'},
            { data: 'src_ip'},
            { data: 'dst_ip'},
            { data: 'protocol'},
            {
                data: null,
                render: (data, type, row) => `${row.src_port || '?'} -> ${row.dst_port || '?'}`
            },
            { data: 'size'},
            {
                data: 'payload',
                render: function(data, type, row) {
                    if (!data) return '';
                    return data.length > 50 ? data.slice(0, 50) + '…' : data;
                }
            }
        ]
    });

    console.log("DataTable initialized successfully.");
    } catch (error) {
        console.error("Error initializing DataTable:", error);
        if (tableElement) tableElement.innerHTML = "Error loading packet table.";
    }
    if (modeModalElement) {
        modeModal = new bootstrap.Modal(modeModalElement, { backdrop: 'static', keyboard: false });
    } else {
        console.error("Mode Selection Modal element not found!");
    }
    console.log("Setting up socket connection...");
    try {
        socket = io({ transports: ['websocket', 'polling'], reconnectionAttempts: 5 });
        socket.on('connect', () => console.log('Connected to WebSocket server with ID:', socket.id));
        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            alert('Chyba pri pripojení k serveru');
        });
        socket.on('disconnect', (reason) => {
            console.log('Disconnected from WebSocket server:', reason);
            if (startCaptureBtn) startCaptureBtn.disabled = true;
            if (stopCaptureBtn) stopCaptureBtn.style.display = 'none';
            if (changeModeBtn) changeModeBtn.disabled = true; 
             alert(`Odpojený od serveru: ${reason}. Prosím pripojte server a skúste znova`);
        });
        socket.on('all_packets', (data) => {
            console.log('Received all packets:', data.packets?.length || 0);
            if (table && data.packets) {
                clearTableData();
                table.rows.add(data.packets).draw();
                packetCount = data.packets.length;
                updatePacketCount();
                packetData = data.packets;
                updateVisualizations();
            }
        });
        socket.on('new_packets', (data) => {
            if (table && data.packets?.length > 0) {
                table.rows.add(data.packets).draw(false);
                packetCount += data.packets.length;
                updatePacketCount();
                packetData = packetData.concat(data.packets);
                updateVisualizations();
            }
        });
        socket.on('capture_started', (data) => console.log('Capture started event received from server:', data));
        socket.on('capture_stopped', () => {
            console.log('Capture stopped event received from server');
            updateUIForStoppedState();
        });
        socket.on('data_cleared', () => {
            console.log('Data cleared event received from server');
            clearTableData();
        });

    } catch (error) {
        console.error("Error initializing Socket.IO:", error);
        alert("Nepodarilo sa inicializovať Socket.IO");
    }
    function updatePacketCount() {
        const packetCountElement = document.getElementById('packet-count');
        if (packetCountElement) {
            packetCountElement.textContent = packetCount; 
        }
    }
    function loadInterfaces() {
        fetch('/interfaces')
            .then(response => {
                if (!response.ok) throw new Error(`Network response error (${response.status})`);
                return response.json();
            })
            .then(interfaces => {
                [interfaceSelector, modalInterfaceSelector].forEach(selector => {
                    if (!selector) return;
                    selector.innerHTML = ''; 
                    selector.disabled = true; 

                    const defaultOption = document.createElement('option');
                    defaultOption.value = '';
                    defaultOption.textContent = 'Zvoľte sieťové rozhranie';
                    defaultOption.disabled = true;
                    defaultOption.selected = true;
                    selector.appendChild(defaultOption);

                    if (interfaces?.length > 0) {
                        interfaces.forEach(iface => {
                            const option = document.createElement('option');
                            option.value = iface.name;
                            option.textContent = iface.display_name;
                            selector.appendChild(option);
                        });
                        selector.disabled = false; 
                    } else {
                         const noIfaceOption = document.createElement('option');
                         noIfaceOption.value = '';
                         noIfaceOption.textContent = 'No interfaces found';
                         selector.appendChild(noIfaceOption); 
                    }
                });
            })
            .catch(error => {
                console.error('Error loading interfaces:', error);
                [interfaceSelector, modalInterfaceSelector].forEach(selector => {
                    if (!selector) return;
                    selector.innerHTML = '<option value="">Error loading</option>';
                    selector.disabled = true;
                });
            });
    }
    function startLiveCapture() {
        const selectedInterface = interfaceSelector.value;
        const filterValue = displayFilterInput.value.toLowerCase();
        if (!selectedInterface) {
            alert('Prosím vyberte sieťové rozhranie');
            return;
        }
        console.log(`Starting live capture on interface: ${selectedInterface}, Filter: ${filterValue}`);
        updateUIForRunningState(); 
        fetch('/start_capture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interface: selectedInterface, filter: filterValue })
        })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, body: data })))
        .then(({ ok, status, body }) => {
            if (!ok) throw new Error(body.error || `Server error: ${status}`);
            console.log('Live capture started successfully via server:', body);
        })
        .catch(error => {
            console.error('Error starting live capture:', error);
            alert(`Chyba pri spustení zachytávania: ${error.message}`);
            updateUIForStoppedState(); 
        });
    }
    function startPcapAnalysis() {
        const file = pcapFileInput?.files[0]; 
        const filterValue = displayFilterInput.value.toLowerCase();
        if (!file) {
            alert('Žiadny PCAP súbor, prosím vyberte PCAP súbor');
            resetCaptureModeAndShowModal(); 
            return;
        }
        console.log(`Starting PCAP analysis for file: ${file.name}, Filter: ${filterValue}`);
        const formData = new FormData();
        formData.append('file', file);
        if (filterValue) formData.append('filter', filterValue);

        updateUIForRunningState(); 
        fetch('/analyze_pcap', { method: 'POST', body: formData })
        .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, body: data })))
        .then(({ ok, status, body }) => {
            if (!ok) throw new Error(body.error || `Server error: ${status}`);
            console.log('PCAP analysis started successfully via server:', body);
        })
        .catch(error => {
            console.error('Error starting PCAP analysis:', error);
            alert(`Chyba pri analýze PCAP súboru: ${error.message}`);
            updateUIForStoppedState(); 
        });
    }
    function handlePcapOptionClick() {
        pcapOption.classList.add('selected');
        liveOption.classList.remove('selected');
        pcapFileInputContainer.style.display = 'block';
        interfaceSelectContainer.style.display = 'none';
        selectedModeInModal = 'pcap';
        updateConfirmButtonState();
    }
    function handleLiveOptionClick() {
        liveOption.classList.add('selected');
        pcapOption.classList.remove('selected');
        interfaceSelectContainer.style.display = 'block';
        pcapFileInputContainer.style.display = 'none';
        selectedModeInModal = 'live';
        if(modalInterfaceSelector && modalInterfaceSelector.options.length <= 1) loadInterfaces();
        updateConfirmButtonState();
    }
    function updateConfirmButtonState() {
        if (!confirmModeBtn) return;
        if (selectedModeInModal === 'pcap') {
            confirmModeBtn.disabled = !pcapFileInput?.files?.length;
        } else if (selectedModeInModal === 'live') {
            confirmModeBtn.disabled = !modalInterfaceSelector?.value;
        } else {
            confirmModeBtn.disabled = true;
        }
    }
    function handleConfirmModeClick() {
        captureMode = selectedModeInModal; 
        console.log('Mode confirmed via modal:', captureMode);

        if (!captureMode) {
            console.error("Confirmation clicked, but no mode was selected.");
            return;
        }
        if (captureMode === 'pcap' && (!pcapFileInput?.files || !pcapFileInput.files[0])) {
             alert("Prosím vyberte PCAP súbor");
             return;
        }
        if (captureMode === 'live' && !modalInterfaceSelector?.value) {
             alert("Prosím vyberte sieťové rozhranie");
             return;
        }
        updateUIForStoppedState(); 
        if (captureMode === 'pcap') {
            const fileName = pcapFileInput.files[0].name;
            if (currentPcapFileSpan) currentPcapFileSpan.textContent = fileName;
        } else if (captureMode === 'live') {
            if (interfaceSelector) interfaceSelector.value = modalInterfaceSelector.value;
        }

        if (modeModal) modeModal.hide();
        if (startCaptureBtn) startCaptureBtn.disabled = false; 
        if (changeModeBtn) changeModeBtn.disabled = false; 
    }
    function handleStartCaptureClick() {
        console.log('Start button clicked. Current captureMode is:', captureMode);
        if (captureMode === 'pcap'){
            handleClearData();
            startPcapAnalysis();
        }
        else if (captureMode === 'live'){
            startLiveCapture();
        }
        else {
            console.error('Start clicked, but captureMode is invalid or null:', captureMode);
            alert('No valid capture mode selected. Please click "Change Mode".');
        }
    }
    function handleStopCaptureClick() {
        console.log(`Stop button clicked. Current mode: ${captureMode}`);
        const endpoint = captureMode === 'pcap' ? '/stop_pcap_analysis' : '/stop_capture';
        if (stopCaptureBtn) stopCaptureBtn.disabled = true;

        fetch(endpoint, { method: 'POST' })
            .then(response => response.json().then(data => ({ ok: response.ok, status: response.status, body: data })))
            .then(({ ok, status, body }) => {
                if (!ok) throw new Error(body.error || `Server error: ${status}`);
                console.log('Stop request successful:', body);
                updateUIForStoppedState();
            })
            .catch(error => {
                console.error('Error stopping capture:', error);
                alert(`Error stopping capture: ${error.message}.`);
                if (stopCaptureBtn) stopCaptureBtn.disabled = false;
            });
    }
    function handleChangePcapClick() { 
        const tempFileInput = document.createElement('input');
        tempFileInput.type = 'file';
        tempFileInput.accept = '.pcap,.pcapng';
        tempFileInput.style.display = 'none';
        clearTableData(); 
        tempFileInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                if (pcapFileInput) {
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(this.files[0]);
                    pcapFileInput.files = dataTransfer.files; 
                    console.log("Updated hidden pcapFileInput with:", this.files[0].name);
                    if (currentPcapFileSpan) currentPcapFileSpan.textContent = this.files[0].name;
                    if (startCaptureBtn) startCaptureBtn.disabled = false; 
                    console.log("New PCAP file selected. Ready to start analysis.");
                } else {
                    console.error("Original pcapFileInput element not found.");
                }
            }
            document.body.removeChild(tempFileInput);
        });
        document.body.appendChild(tempFileInput);
        tempFileInput.click();
    }
    function handleChangeModeClick() { 
        console.log("Change Mode button clicked.");
        if (stopCaptureBtn && stopCaptureBtn.style.display !== 'none') {
             alert("Please stop the current capture before changing the mode.");
             return;
        }
        resetCaptureModeAndShowModal();
    }
    function updateUIForRunningState() {
        if (startCaptureBtn) startCaptureBtn.style.display = 'none';
        if (stopCaptureBtn) {
             stopCaptureBtn.style.display = 'inline-block';
             stopCaptureBtn.disabled = false; 
        }
        if (changeModeBtn) changeModeBtn.style.display = 'none'; 
        if (changePcapBtn) changePcapBtn.style.display = 'none'; 
        if (displayFilterInput) displayFilterInput.disabled = true;
        if (interfaceSelector) interfaceSelector.disabled = true;
    }
    function updateUIForStoppedState() {
        if (startCaptureBtn) {
             startCaptureBtn.style.display = 'inline-block';
             startCaptureBtn.disabled = !captureMode;
        }
        if (stopCaptureBtn) {
            stopCaptureBtn.style.display = 'none';
            stopCaptureBtn.disabled = false; 
        }
        if (changeModeBtn) {
             changeModeBtn.style.display = 'inline-block'; 
             changeModeBtn.disabled = false;
        }
        if (captureMode === 'pcap') {
            if (pcapControlDiv) pcapControlDiv.style.display = 'block';
            if (interfaceControlDiv) interfaceControlDiv.style.display = 'none';
            if (changePcapBtn) changePcapBtn.style.display = 'inline-block'; 
        } else if (captureMode === 'live') {
            if (pcapControlDiv) pcapControlDiv.style.display = 'none';
            if (interfaceControlDiv) interfaceControlDiv.style.display = 'block';
            if (changePcapBtn) changePcapBtn.style.display = 'none';
        } else {
             if (pcapControlDiv) pcapControlDiv.style.display = 'none';
             if (interfaceControlDiv) interfaceControlDiv.style.display = 'none';
             if (changePcapBtn) changePcapBtn.style.display = 'none';
        }
        if (displayFilterInput) displayFilterInput.disabled = false;
        if (interfaceSelector) interfaceSelector.disabled = (captureMode !== 'live'); 

    }
    function resetCaptureModeAndShowModal() {
        captureMode = null; 
        selectedModeInModal = null;
        if (interfaceSelector) interfaceSelector.value = '';
        if (pcapControlDiv) pcapControlDiv.style.display = 'none';
        if (interfaceControlDiv) interfaceControlDiv.style.display = 'none';
        if (currentPcapFileSpan) currentPcapFileSpan.textContent = 'Žiadny PCAP súbor';
        if (startCaptureBtn) {
            startCaptureBtn.style.display = 'inline-block';
            startCaptureBtn.disabled = true;
        }
        if (stopCaptureBtn) stopCaptureBtn.style.display = 'none';
        if (changeModeBtn) {
             changeModeBtn.style.display = 'inline-block';
             changeModeBtn.disabled = true;
        }
        if (changePcapBtn) changePcapBtn.style.display = 'none';
        if (displayFilterInput) displayFilterInput.disabled = true; 
        if (interfaceSelector) interfaceSelector.disabled = true; 
        if (pcapOption) pcapOption.classList.remove('selected');
        if (liveOption) liveOption.classList.remove('selected');
        if (pcapFileInputContainer) pcapFileInputContainer.style.display = 'none';
        if (interfaceSelectContainer) interfaceSelectContainer.style.display = 'none';
        if (pcapFileInput) pcapFileInput.value = '';
        if (modalInterfaceSelector) modalInterfaceSelector.value = '';
        if (confirmModeBtn) confirmModeBtn.disabled = true;

        clearTableData(); 

        if (modeModal) modeModal.show(); 
        else console.error("Cannot show modal, instance not available.");
    }
    function handleClearData() {
        fetch('/clear_data', {
            method: 'POST',  
            headers: {
                'Content-Type': 'application/json',  
            },
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Data folder cleared:', data.message);
            } else {
                console.error('Failed to clear data:', data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
        });
    }
    function updateVisualizations() {
        updateGeneralVisualization();
        updateSpecificVisualization();
    }
    function updateGeneralVisualization() {
        if (!generalVisualizationContainer) return;
        d3.select(generalVisualizationContainer).selectAll('*').remove();
        
        if (packetData.length === 0) {
            chartFunctions.showNoDataMessage(generalVisualizationContainer);
            return;
        }
        switch (currentGeneralVisualization) {
            case 'data-usage':
                chartFunctions.createDataUsageTimeline(packetData);
                break;
            case 'protocol-distribution':
                chartFunctions.createProtocolDistributionChart(packetData);
                break;
            case 'packet-size-histogram':
                chartFunctions.createPacketSizeHistogram(packetData);
                break;
            case 'packet-timeline':
                chartFunctions.createPacketTimeline(packetData);
                break;
            case 'top-ips':
                chartFunctions.createTopIPsChart(packetData);
                break;
            case 'all':
                chartFunctions.createPacketFlowDiagram(packetData);
                break;
            case 'port-distribution':
                chartFunctions.createPortDistributionChart(packetData);
                break;
            case 'connection-graph':
                chartFunctions.createConnectionGraph(packetData);
                break;
            default:
                chartFunctions.createDataUsageTimeline(packetData);
        }
    }
    function updateSpecificVisualization() {
        if (!specificVisualizationContainer) {
            console.error("Specific visualization container not found");
            return;
        }
        d3.select(specificVisualizationContainer).selectAll('*').remove();
        
        if (!packetData || packetData.length === 0) {
            chartFunctions.showNoDataMessage(specificVisualizationContainer);
            return;
        }
        const filteredData = currentSpecificProtocol === 'all'
            ? packetData
            : packetData.filter(p => p.protocol && p.protocol.toLowerCase() === currentSpecificProtocol.toLowerCase());
        
        if (filteredData.length === 0) {
            chartFunctions.showNoDataMessage(specificVisualizationContainer, 
                `Neboli nájdené žiadne ${currentSpecificProtocol.toUpperCase()} pakety`);
            return;
        }
        
        switch (currentSpecificVisualization) {
            case 'tcp-flags':
                chartFunctions.createTCPFlagDistribution(filteredData);
                break;
            case 'tcp-retransmissions':
                chartFunctions.createTCPRetransmissionsOverTime(filteredData);
                break;
            case 'tcp-window-size':
                chartFunctions.createTCPWindowSizeOverTime(filteredData);
                break;
            case 'tcp-seq-ack':
                chartFunctions.createTCPSequenceAckProgression(filteredData);
                break;
            case 'udp-flows':
                chartFunctions.createUDPFlowDiagram(filteredData);
                break;
            case 'udp-size':
                chartFunctions.createUDPSizeDistribution(filteredData);
                break;
            case 'http-methods':
                chartFunctions.createHTTPMethodsFrequency(filteredData);
                break;
            case 'http-codes':
                chartFunctions.createHTTPCodesDistribution(filteredData);
                break;
            case 'arp-freq':
                chartFunctions.createARPFrequency(filteredData);
                break;
            case 'arp-count':
                chartFunctions.createARPCountVisualization(filteredData);
                break;
            case 'icmp-types':
                chartFunctions.createICMPTypesDistribution(filteredData);
                break;
            case 'icmp-freq':
                chartFunctions.createICMPFrequencyVisualization(filteredData);
                break;
            case 'dns-time':
                chartFunctions.createDNSTimeDistribution(filteredData);
                break;
            case 'dns-domains':
                chartFunctions.createDNSDomains(filteredData);
                break;
            case 'modbus-codes':
                chartFunctions.createMODBUSCodes(filteredData);
                break;
            case 'modbus-exceptions':
                chartFunctions.createModbusExceptionVisualization(filteredData);
                break;
            case 'dnp3-objects':
                chartFunctions.createDNP3ObjectTypesVisualization(filteredData);
                break;
            case 'dnp3-events':
                chartFunctions.createDNP3EventsByClassVisualization(filteredData);
                break;
            case 's7-racks':
                chartFunctions.createS7RacksVisualization();
                break;
            case 's7-functions':
                chartFunctions.createS7FunctionsVisualization(filteredData);
                break;
            default:
                chartFunctions.createTCPFlagDistribution(filteredData);
        }
    }
    
    if (generalVisualizationType) {
        generalVisualizationType.addEventListener('change', function() {
            currentGeneralVisualization = this.value;
            updateGeneralVisualization();
        });
    }
    
    if (specificProtocolType) {
        specificProtocolType.addEventListener('change', function() {
            currentSpecificProtocol = this.value;
            updateSpecificVisualization();
        });
    }
    
    if (specificVisualizationType) {
        specificVisualizationType.addEventListener('change', function() {
            currentSpecificVisualization = this.value;
            updateSpecificVisualization();
        });
    }
    
    if (updateGeneralVisualizationBtn) {
        updateGeneralVisualizationBtn.addEventListener('click', updateGeneralVisualization);
    }
    
    if (updateSpecificVisualizationBtn) {
        updateSpecificVisualizationBtn.addEventListener('click', updateSpecificVisualization);
    }
    function clearTableData() {
        if (table) {
            table.clear().draw();
            packetCount = 0;
            const scrollBody = tableElement?.parentElement?.querySelector('.dataTables_scrollBody');
            if (scrollBody) scrollBody.scrollTop = 0;
    
            console.log('DataTable cleared.');
            updatePacketCount();
        } else {
            console.warn('clearTableData called but DataTable instance not found.');
        }
        packetData = [];
        updateVisualizations();
    }
    window.clearTableData = clearTableData;
    if (pcapOption) pcapOption.addEventListener('click', handlePcapOptionClick);
    if (liveOption) liveOption.addEventListener('click', handleLiveOptionClick);
    if (pcapFileInput) pcapFileInput.addEventListener('change', updateConfirmButtonState);
    if (modalInterfaceSelector) modalInterfaceSelector.addEventListener('change', updateConfirmButtonState);
    if (confirmModeBtn) {
        confirmModeBtn.addEventListener('click', handleConfirmModeClick);
        confirmModeBtn.addEventListener('click', handleClearData);
    }
    if (startCaptureBtn) startCaptureBtn.addEventListener('click', handleStartCaptureClick);
    if (stopCaptureBtn) stopCaptureBtn.addEventListener('click', handleStopCaptureClick);
    if (changePcapBtn) changePcapBtn.addEventListener('click', handleChangePcapClick);
    if (changeModeBtn) changeModeBtn.addEventListener('click', handleChangeModeClick); 
    if (clearTableBtn) clearTableBtn.addEventListener('click', clearTableData);
    if (clearTableBtn) clearTableBtn.addEventListener('click', handleClearData);

    if (displayFilterInput) {
        displayFilterInput.addEventListener('input', function(event) {
            const cursorStart = this.selectionStart;
            const cursorEnd = this.selectionEnd;
            const originalValue = this.value;
            const lowerCaseValue = originalValue.toLowerCase();

            if (originalValue !== lowerCaseValue) {
               this.value = lowerCaseValue;
               this.setSelectionRange(cursorStart, cursorEnd);
            }
        });
    } else {
        console.warn("Display Filter input element not found.");
    }

    document.getElementById('specificProtocolType').addEventListener('change', function() {
        const protocol = this.value;
        currentSpecificProtocol = protocol;
        const visualizationSelect = document.getElementById('specificVisualizationType');
        visualizationSelect.innerHTML = '';
        switch(protocol) {
            case 'tcp':
                addOption(visualizationSelect, 'tcp-flags', 'Distribúcia TCP vlajok');
                addOption(visualizationSelect, 'tcp-retransmissions', 'Opakované TCP prenosy');
                addOption(visualizationSelect, 'tcp-window-size', 'Veľkosť okna v čase');
                addOption(visualizationSelect, 'tcp-seq-ack', 'Progresia SEQ a ACK vlajok');
                break;
            case 'udp':
                addOption(visualizationSelect, 'udp-flows', 'Najväčšie UDP toky (UDP flows)');
                addOption(visualizationSelect, 'udp-size', 'Distribúcia veľkostí UDP packetov');
                break;
            case 'http':
                addOption(visualizationSelect, 'http-methods', 'Frekvencia HTTP metód');
                addOption(visualizationSelect, 'http-codes', 'Distribúcia HTTP kódov');
                break;
            case 'arp':
                addOption(visualizationSelect, 'arp-freq', 'Frekvencia ARP požiadaviek a odpovedí');
                addOption(visualizationSelect, 'arp-count', 'Počet ARP správ podľa IP adresy');
                break;
            case 'icmp':
                addOption(visualizationSelect, 'icmp-types', 'Rozdelenie ICMP Type správ');
                addOption(visualizationSelect, 'icmp-freq', 'Frekvencia ICMP požiadaviek a odpovedí');
                break;
            case 'dns':
                addOption(visualizationSelect, 'dns-time', 'Distribúcia času DNS odoziev');
                addOption(visualizationSelect, 'dns-domains', 'Top vyhľadávané doménové mená');
                break;
            case 'modbus':
                addOption(visualizationSelect, 'modbus-codes', 'Distribúcia Modbus funkčných kódov');
                addOption(visualizationSelect, 'modbus-exceptions', 'Frekvencia Modbus výnimok');
                break;
            case 'dnp3':
                addOption(visualizationSelect, 'dnp3-objects', 'Používané typy DNP3 objektov');
                addOption(visualizationSelect, 'dnp3-events', 'DNP3 udalosti podľa tried');
                break;
            case 's7comm':
                addOption(visualizationSelect, 's7-functions', 'Používané S7 funkcie – read/write');
                addOption(visualizationSelect, 's7-racks', 'Využívanie S7 rackov a slotov');
                break;
            default:
                addOption(visualizationSelect, 'visPlaceholder', 'Vyberte vizualizáciu...');
                break;
        }
        if (visualizationSelect.options.length > 0) {
            visualizationSelect.selectedIndex = 0;
            currentSpecificVisualization = visualizationSelect.value;
            updateSpecificVisualization();
        }
    });
    
    function addOption(select, value, text) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    }

    document.getElementById('exportGeneralBtn').addEventListener('click', () => {
        exportSVGAsPNG(document.querySelector('#generalVisualizationContainer svg'), 'general-visualization.png');
    });
    
    document.getElementById('exportSpecificBtn').addEventListener('click', () => {
        exportSVGAsPNG(document.querySelector('#specificVisualizationContainer svg'), 'specific-visualization.png');
    });
    
    function exportSVGAsPNG(svgElement, filename) {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svgElement);
    
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
    
        const image = new Image();
        image.onload = function () {
            const canvas = document.createElement('canvas');
            canvas.width = svgElement.clientWidth;
            canvas.height = svgElement.clientHeight;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
    
            const imgURI = canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = filename;
            link.href = imgURI;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };
    
        image.src = url;
    }
    function exportTableToJSON() {
        if (!packetData || packetData.length === 0) {
            alert('No data to export.');
            return;
        }
        const jsonData = JSON.stringify(packetData, null, 4);
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'packet_data.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('Table data exported as JSON');
    }
    
    function exportTableToCSV() {
        if (!packetData || packetData.length === 0) {
            alert('No data to export.');
            return;
        }
        const headers = Object.keys(packetData[0]);
        let csvContent = headers.join(',') + '\n';
        packetData.forEach(packet => {
            const row = headers.map(header => {
                let value = packet[header];
                if (value === null || value === undefined) {
                    value = '';
                } else if (typeof value === 'object') {
                    value = JSON.stringify(value);
                }
                value = String(value).replace(/"/g, '""');
                if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                    value = `"${value}"`;
                }
                
                return value;
            }).join(',');
            
            csvContent += row + '\n';
        });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'packet_data.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log('Table data exported as CSV');
    }

    document.getElementById('exportJSONBtn').addEventListener('click', exportTableToJSON);
    document.getElementById('exportCSVBtn').addEventListener('click', exportTableToCSV);
    loadInterfaces(); 
    clearTableData();
    resetCaptureModeAndShowModal(); 

    console.log("DOMContentLoaded setup complete.");

});