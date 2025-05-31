from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_socketio import SocketIO, emit
from collections import Counter
from flask_cors import CORS
import pyshark
import threading
import queue
import os
import time
import asyncio
import pyshark.tshark.tshark as tshark
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading', logger=True, engineio_logger=True)

capture_thread = None
stop_event = threading.Event()
stop_event.set()

packet_queue = queue.Queue(maxsize=1000)
all_packets = []

TEMP_FOLDER = './temp_pcap'
os.makedirs(TEMP_FOLDER, exist_ok=True)

def analyze_packets(file_path, filters, display_filter=None):
    cap = pyshark.FileCapture(file_path, display_filter=display_filter) if display_filter else pyshark.FileCapture(file_path)
    
    protocol_counts = Counter()
    filtered_packets = []

    for packet in cap:
        try:
            if filters:
                has_ip = hasattr(packet, 'ip')
                src_ip = packet.ip.src if has_ip else "N/A"
                dst_ip = packet.ip.dst if has_ip else "N/A"

                if filters.get('ip_a') and filters.get('ip_b'):
                    if not ((src_ip == filters['ip_a'] and dst_ip == filters['ip_b']) or
                            (src_ip == filters['ip_b'] and dst_ip == filters['ip_a'])):
                        continue
                elif filters.get('ip_a') and src_ip != filters['ip_a'] and dst_ip != filters['ip_a']:
                    continue
                elif filters.get('ip_b') and src_ip != filters['ip_b'] and dst_ip != filters['ip_b']:
                    continue
            packet_info = extract_packet_info(packet)
            if packet_info:
                filtered_packets.append(packet_info)
                protocol_counts[packet_info["protocol"]] += 1

        except Exception as e:
            print(f"Error processing packet: {e}")

    cap.close()
    return {
        "protocol_counts": protocol_counts,
        "filtered_packets": filtered_packets,
    }

def extract_packet_info(packet):
    try:
        timestamp = packet.sniff_time.strftime("%H:%M:%S")
        src_ip = packet.ip.src if hasattr(packet, 'ip') else "N/A"
        dst_ip = packet.ip.dst if hasattr(packet, 'ip') else "N/A"
        if hasattr(packet, 'udp'):
            protocol = 'UDP'
        else:
            protocol = packet.highest_layer
        size = int(packet.length)
        src_port = "-"
        dst_port = "-"
        if hasattr(packet, "transport_layer") and packet.transport_layer:
            transport_layer = packet.transport_layer.lower()
            if hasattr(packet, transport_layer):
                layer = getattr(packet, transport_layer)
                src_port = getattr(layer, "srcport", "-")
                dst_port = getattr(layer, "dstport", "-")

        payload = "N/A"

        try:
            raw_protocols = ['TLS', 'QUIC', 'LLMNR', 'DATA', 'SSDP']
            if protocol in raw_protocols and hasattr(packet, 'data'):
                protocol_layer = getattr(packet, protocol.lower(), None)
                if protocol_layer:
                    for field_name in dir(protocol_layer):
                        if not field_name.startswith('_') and field_name not in ['field_names', 'layer_name']:
                            try:
                                field_value = getattr(protocol_layer, field_name)
                                if isinstance(field_value, (str, bytes)):
                                    if len(field_value) > 0:
                                        payload = f"{field_name}: {field_value[:50]}" 
                                        break
                            except Exception as e:
                                payload = f"Error accessing {field_name}: {str(e)}"
            else:
                if protocol == "UDP" and hasattr(packet, "udp"):
                    if (hasattr(packet.udp, "dstport") and int(packet.udp.dstport) == 12345):
                        try:
                            import struct
                            import json
                            import time

                            payload_bytes = None
                            if hasattr(packet.udp, "payload"):
                                try:
                                    udp_payload_hex = packet.udp.payload.replace(':', '')
                                    payload_bytes = bytes.fromhex(udp_payload_hex)
                                except:
                                    pass

                            if payload_bytes is None and hasattr(packet, "data"):
                                try:
                                    data_layer = packet.data
                                    if hasattr(data_layer, "data"):
                                        udp_payload_hex = data_layer.data.replace(':', '')
                                        payload_bytes = bytes.fromhex(udp_payload_hex)
                                except:
                                    pass

                            if payload_bytes is None and hasattr(packet, "frame_raw"):
                                try:
                                    raw_data = packet.frame_raw.value
                                    frame_bytes = bytes.fromhex(raw_data)
                                    udp_data_offset = 42
                                    if len(frame_bytes) > udp_data_offset:
                                        payload_bytes = frame_bytes[udp_data_offset:]
                                except:
                                    pass

                            if payload_bytes and len(payload_bytes) >= 20:
                                sent_timestamp, sequence, sent_timestamp_ns = struct.unpack('!dIQ',
                                                                                            payload_bytes[:20])
                                current_time_ns = time.time_ns()
                                delay_ns = current_time_ns - sent_timestamp_ns
                                delay_ms = delay_ns / 1_000_000.0
                                current_time = time.time()
                                delay_ms_regular = (current_time - sent_timestamp) * 1000
                                try:
                                    json_payload = payload_bytes[20:].decode('utf-8')
                                    payload_data = json.loads(json_payload)
                                    message = payload_data.get('message', 'N/A')
                                except:
                                    message = 'Parse error'
                                if delay_ms < 0:
                                    payload = f"Seq:{sequence} Delay:{delay_ms:.1f}ms(NEG!) Alt:{delay_ms_regular:.1f}ms Msg:{message[:15]}"
                                else:
                                    payload = f"Seq:{sequence} Delay:{delay_ms:.1f}ms Msg:{message[:20]}"

                            elif payload_bytes and len(payload_bytes) >= 12:
                                sent_timestamp, sequence = struct.unpack('!dI', payload_bytes[:12])
                                current_time = time.time()
                                delay_ms = (current_time - sent_timestamp) * 1000

                                try:
                                    json_payload = payload_bytes[12:].decode('utf-8')
                                    payload_data = json.loads(json_payload)
                                    message = payload_data.get('message', 'N/A')
                                except:
                                    message = 'Parse error'

                                if delay_ms < 0:
                                    payload = f"Seq:{sequence} Delay:{delay_ms:.1f}ms(NEG-OLD!) Msg:{message[:15]}"
                                else:
                                    payload = f"Seq:{sequence} Delay:{delay_ms:.1f}ms Msg:{message[:20]}"
                            else:
                                available_attrs = [attr for attr in dir(packet.udp) if not attr.startswith('_')]
                                payload = f"Port:12345 Attrs:{','.join(available_attrs[:3])} Len:{packet.udp.length if hasattr(packet.udp, 'length') else 'N/A'}"

                        except Exception as e:
                            payload = f"Port:12345 ParseError: {str(e)[:25]}"
                    else:
                        if hasattr(packet.udp, "length"):
                            payload = f"Len: {packet.udp.length}"
                elif protocol == 'HTTP' and hasattr(packet, 'http'):
                    http_data = []
                    if hasattr(packet.http, 'request_method'):
                        http_data.append(f"Method: {packet.http.request_method}")
                    if hasattr(packet.http, 'request_uri'):
                        http_data.append(f"URI: {packet.http.request_uri}")
                    if hasattr(packet.http, 'response_code'):
                        http_data.append(f"Status: {packet.http.response_code}")
                    if hasattr(packet.http, 'host'):
                        http_data.append(f"Host: {packet.http.host}")
                    payload = ', '.join(http_data)
                elif protocol == 'MDNS' and hasattr(packet, 'mdns'):
                    mdns_data = []
                    if hasattr(packet.mdns, 'qry_name'):
                        mdns_data.append(f"Query Name: {packet.mdns.qry_name}")
                    if hasattr(packet.mdns, 'qry_type'):
                        mdns_data.append(f"Query Type: {packet.mdns.qry_type}")
                    if hasattr(packet.mdns, 'a'):
                        mdns_data.append(f"Answer: {packet.mdns.a}")
                    payload = ', '.join(mdns_data) if mdns_data else "N/A"
                elif protocol == 'ICMP' and hasattr(packet, 'icmp'):
                    icmp_data = []
                    if hasattr(packet.icmp, 'type'):
                        icmp_data.append(f"Type: {packet.icmp.type}")
                    if hasattr(packet.icmp, 'code'):
                        icmp_data.append(f"Code: {packet.icmp.code}")
                    payload = ', '.join(icmp_data)
                elif protocol == 'DNS' and hasattr(packet, 'dns'):
                    dns_data = []
                    is_response = str(getattr(packet.dns, 'flags_response', '0')) in ['1', 'true', 'True']
                    dns_data.append("Response" if is_response else "Query")
                    if hasattr(packet.dns, 'qry_name'):
                        dns_data.append(f"Name: {packet.dns.qry_name}")
                    if is_response and hasattr(packet.dns, 'a'):
                        dns_data.append(f"Answer: {packet.dns.a}")
                    payload = ', '.join(dns_data)
                elif protocol == 'ARP' and hasattr(packet, 'arp'):
                    arp_data = []
                    if hasattr(packet.arp, 'opcode'):
                        opcode = int(packet.arp.opcode)
                        arp_data.append("who-has" if opcode == 1 else "is-at")
                    if hasattr(packet.arp, 'src_proto_ipv4'):
                        arp_data.append(f"Sender: {packet.arp.src_proto_ipv4}")
                    if hasattr(packet.arp, 'dst_proto_ipv4'):
                        arp_data.append(f"Target: {packet.arp.dst_proto_ipv4}")
                    payload = ', '.join(arp_data)
                elif protocol == 'MODBUS' and hasattr(packet, 'modbus'):
                    modbus_data = []
                    if hasattr(packet.modbus, 'func_code'):
                        modbus_data.append(f"Code: {packet.modbus.func_code}")
                    if hasattr(packet.modbus, 'exception_code'):
                        modbus_data.append(f"Exception: {packet.modbus.exception_code}")
                    if hasattr(packet.modbus, 'transaction_id'):
                        modbus_data.append(f"Transaction ID: {packet.modbus.transaction_id}")
                    payload = ', '.join(modbus_data)
                elif protocol == 'DNP3' and hasattr(packet, 'dnp3'):
                    dnp3_data = []
                    if hasattr(packet.dnp3, 'ctl_func'):
                        dnp3_data.append(f"Code: {packet.dnp3.ctl_func}")
                    if hasattr(packet.dnp3, 'al_obj'):
                        dnp3_data.append(f"Object: {packet.dnp3.al_obj}")
                    if hasattr(packet.dnp3, 'al_class'):
                        dnp3_data.append(f"Class: {packet.dnp3.al_class}")
                    payload = ', '.join(dnp3_data)
                elif protocol == 'S7COMM' and hasattr(packet, 's7comm'):
                    s7_data = []
                    if hasattr(packet.s7comm, 'param_func'):
                        s7_data.append(f"Code: {packet.s7comm.param_func}")
                    if hasattr(packet.s7comm, 'param_setup_rack_num'):
                        s7_data.append(f"Rack: {packet.s7comm.param_setup_rack_num}")
                    if hasattr(packet.s7comm, 'param_setup_slot_num'):
                        s7_data.append(f"Slot: {packet.s7comm.param_setup_slot_num}")
                    if hasattr(packet.s7comm, 'item_data_type'):
                        s7_data.append(f"Data Type: {packet.s7comm.item_data_type}")
                    payload = ', '.join(s7_data)
                elif hasattr(packet, 'tcp'):
                    src_port = packet.tcp.srcport
                    dst_port = packet.tcp.dstport

                    tcp_payload = []
                    if hasattr(packet.tcp, 'flags'):
                        try:
                            flag_value = int(packet.tcp.flags, 16)
                            flags = []
                            if flag_value & 0x01: flags.append("FIN")
                            if flag_value & 0x02: flags.append("SYN")
                            if flag_value & 0x04: flags.append("RST")
                            if flag_value & 0x08: flags.append("PSH")
                            if flag_value & 0x10: flags.append("ACK")
                            if flag_value & 0x20: flags.append("URG")
                            if flags:
                                tcp_payload.append(f"[{','.join(flags)}]")
                        except ValueError:
                            pass
                    if hasattr(packet.tcp, 'seq'):
                        tcp_payload.append(f"seq={packet.tcp.seq}")
                    if hasattr(packet.tcp, 'ack'):
                        tcp_payload.append(f"ack={packet.tcp.ack}")
                    if hasattr(packet.tcp, 'window_size'):
                        tcp_payload.append(f"win={packet.tcp.window_size}")

                    extra_tcp_info = []
                    if hasattr(packet.tcp, 'analysis_retransmission'):
                        extra_tcp_info.append("Retransmission")

                    combined_payload = ', '.join(tcp_payload + extra_tcp_info) if (tcp_payload or extra_tcp_info) else "N/A"
                    payload = combined_payload
                else:
                    if hasattr(packet, 'data'):
                        try:
                            data_bytes = bytes.fromhex(packet.data.data)
                            payload = ''.join(chr(b) if 32 <= b <= 126 else '.' for b in data_bytes[:30])
                        except:
                            payload = "N/A"
        
        except Exception as e:
            payload = f"Error: {str(e)[:20]}"
        payload = clean_string(payload)
        if len(payload) > 40:
            payload = payload[:200] + "..."

        return {
            "timestamp": timestamp,
            "src_ip": src_ip,
            "dst_ip": dst_ip,
            "protocol": protocol,
            "src_port": src_port,
            "dst_port": dst_port,
            "size": size,
            "payload": payload
        }
    except Exception as e:
        print(f"Error processing packet: {e}")
        return None
           
def clean_string(s):
    if not isinstance(s, str):
        return str(s)
    return ''.join(c if 32 <= ord(c) <= 126 else '.' for c in s)
def get_interfaces():
    interface_map = {}
    npf_interfaces = tshark.get_tshark_interfaces()
    if os.name == 'nt':
        try:
            from scapy.arch.windows import get_windows_if_list
            scapy_interfaces = get_windows_if_list()
            for iface in scapy_interfaces:
                npf_name = next((npf for npf in npf_interfaces if iface.get('guid', '') in npf), None)
                if npf_name:
                    interface_map[iface['name']] = npf_name
        except ImportError:
            for iface in npf_interfaces:
                name = iface.split('(')[-1].split(')')[0] if '(' in iface else iface
                interface_map[name] = iface
    else: 
        try:
            import netifaces
            for iface in netifaces.interfaces():
                npf_name = next((npf for npf in npf_interfaces if iface in npf), None)
                interface_map[iface] = npf_name or iface
        except ImportError:
            try:
                with open('/proc/net/dev', 'r') as f:
                    for line in f:
                        if ':' in line:
                            iface = line.split(':')[0].strip()
                            if iface != 'lo':
                                interface_map[iface] = iface
            except:
                for iface in npf_interfaces:
                    name = iface.split('(')[-1].split(')')[0] if '(' in iface else iface
                    interface_map[name] = iface
    if not interface_map:
        for iface in npf_interfaces:
            name = iface.split('(')[-1].split(')')[0] if '(' in iface else iface
            interface_map[name] = iface
    result = [
        {
            'name': name,
            'display_name': display_name
        }
        for display_name, name in interface_map.items()
    ]
    return result

def emit_packets_thread():
    while True:
        try:
            batch_size = min(50, packet_queue.qsize())
            if batch_size > 0:
                packets_to_emit = []
                for _ in range(batch_size):
                    try:
                        packets_to_emit.append(packet_queue.get_nowait())
                        packet_queue.task_done()
                    except queue.Empty:
                        break
                
                if packets_to_emit:
                    socketio.emit('new_packets', {'packets': packets_to_emit})
                    socketio.sleep(0.05 if batch_size > 10 else 0.2)
                else:
                    socketio.sleep(0.3)
            else:
                socketio.sleep(0.3)
        except Exception as e:
            print(f"Error in emit thread: {e}")
            socketio.sleep(1)
def packet_capture_thread(interface, display_filter):
    print(f"Starting capture on interface {interface} with filter {display_filter}")
    global all_packets
    capture = None
    
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        if display_filter:
            capture = pyshark.LiveCapture(interface=interface, display_filter=display_filter)
        else:
            capture = pyshark.LiveCapture(interface=interface, display_filter="ip")
            
        print(f"Capture initialized on {interface}")
        for packet in capture.sniff_continuously():
            if stop_event.is_set():
                break
            packet_info = extract_packet_info(packet)
            if packet_info:
                all_packets.append(packet_info)
                if len(all_packets) > 1500:
                    all_packets = all_packets[-1500:]
                if not packet_queue.full():
                    packet_queue.put(packet_info)
                
    except Exception as e:
        print(f"Error during packet capture: {e}")
    finally:
        if 'capture' in locals() and capture:
            print("Closing capture")
            try:
                capture.close()
            except Exception as e:
                print(f"Error closing capture: {e}")
        
        print("Capture thread finished")
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/interfaces')
def interfaces():
    return jsonify(get_interfaces())

@app.route('/start_capture', methods=['POST'])
def start_capture():
    global capture_thread, all_packets
    if not stop_event.is_set():
        return jsonify({'error': 'Capture already running'}), 400
    
    data = request.get_json()
    interface = data.get('interface')
    display_filter = data.get('filter', '')
    
    if not interface:
        return jsonify({'error': 'Interface is required'}), 400
    all_packets = []
    while not packet_queue.empty():
        try:
            packet_queue.get_nowait()
            packet_queue.task_done()
        except:
            pass
    stop_event.clear()
    capture_thread = threading.Thread(
        target=packet_capture_thread,
        args=(interface, display_filter)
    )
    capture_thread.daemon = True
    capture_thread.start()
    
    socketio.emit('capture_started', {'interface': interface})
    return jsonify({'status': 'capture_started', 'interface': interface})

@app.route('/stop_capture', methods=['POST'])
def stop_capture():
    global capture_thread
    if stop_event.is_set():
        return jsonify({'error': 'No capture running'}), 400
    
    stop_event.set()
    
    if capture_thread and capture_thread.is_alive():
        capture_thread.join(timeout=3)
    
    socketio.emit('capture_stopped')
    return jsonify({'status': 'capture_stopped'})

@app.route('/get_packets', methods=['GET'])
def get_packets():
    return jsonify(all_packets)

@app.route('/clear_data', methods=['POST'])
def clear_data():
    global all_packets
    
    try:
        all_packets = []
        while not packet_queue.empty():
            try:
                packet_queue.get_nowait()
                packet_queue.task_done()
            except:
                pass
        socketio.emit('data_cleared')
        return jsonify({'status': 'data_cleared'})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze_pcap', methods=['POST'])
def analyze_pcap_route():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    display_filter = request.form.get('filter', '')
    
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    filename = secure_filename(file.filename)
    temp_filepath = os.path.join(TEMP_FOLDER, f"{int(time.time())}_{filename}")
    file.save(temp_filepath)
    
    try:
        global all_packets
        all_packets = []
        while not packet_queue.empty():
            try:
                packet_queue.get_nowait()
                packet_queue.task_done()
            except:
                pass
        filters = {}
        def run_analysis():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                print(f"Starting analysis on file: {temp_filepath}")
                results = analyze_packets(temp_filepath, filters, display_filter)
                for i in range(0, len(results['filtered_packets']), 50):
                    batch = results['filtered_packets'][i:i+50]
                    all_packets.extend(batch)
                    for packet in batch:
                        if not packet_queue.full():
                            packet_queue.put(packet)
                    time.sleep(0.1)
                protocol_data = [
                    {"name": protocol, "value": count} 
                    for protocol, count in results["protocol_counts"].items()
                ]
                
                socketio.emit('pcap_analysis_complete', {
                    'protocol_counts': protocol_data,
                    'total_packets': len(results['filtered_packets'])
                })
                try:
                    os.remove(temp_filepath)
                except Exception as e:
                    print(f"Error removing temp file: {e}")
                    
            except Exception as e:
                print(f"Analysis error: {e}")
                socketio.emit('pcap_analysis_error', {'error': str(e)})
        analysis_thread = threading.Thread(target=run_analysis)
        analysis_thread.daemon = True
        analysis_thread.start()
        
        socketio.emit('pcap_analysis_started', {'filename': filename})
        
        return jsonify({
            'status': 'pcap_analysis_started',
            'message': 'PCAP analysis has started',
            'filename': filename
        })
        
    except Exception as e:
        try:
            os.remove(temp_filepath)
        except:
            pass
        return jsonify({'error': str(e)}), 500

@app.route('/stop_pcap_analysis', methods=['POST'])
def stop_pcap_analysis():
    socketio.emit('pcap_analysis_stopped')
    return jsonify({'status': 'pcap_analysis_stopped'})
@socketio.on('pcap_packets_batch')
def handle_pcap_packets_batch(data):
    print(f"Sending PCAP packet batch: {len(data['packets'])} packets")

@socketio.on('pcap_analysis_complete')
def handle_pcap_analysis_complete(data):
    print(f"PCAP analysis complete: {data['total_packets']} total packets")

@socketio.on('pcap_analysis_error')
def handle_pcap_analysis_error(data):
    print(f"PCAP analysis error: {data['error']}")

@socketio.on('pcap_analysis_started')
def handle_pcap_analysis_started(data):
    print(f"PCAP analysis started for file: {data['filename']}")
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('all_packets', {'packets': all_packets})
    
@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

if __name__ == '__main__':
    emit_thread = threading.Thread(target=emit_packets_thread)
    emit_thread.daemon = True
    emit_thread.start()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True, use_reloader=True, allow_unsafe_werkzeug=True)
