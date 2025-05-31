import argparse
import asyncio
import pyshark
import threading
import queue
import curses
import subprocess
import json
import csv
import os
import sys

from datetime import datetime
from pcap_analyzer import clean_string, wrap_text

python_cmd = sys.executable

def write_packets_to_json(packets, json_file):
    directory = os.path.dirname(json_file)
    if directory and not os.path.exists(directory):
        os.makedirs(directory)

    data = {
        "packets": packets
    }
    with open(json_file, 'w') as f:
        json.dump(data, f, indent=4)

def write_data_usage_to_json(data_usage, json_file):
    directory = os.path.dirname(json_file)
    if directory and not os.path.exists(directory):
        os.makedirs(directory)

    data_usage_list = [{"timestamp": str(timestamp), "data_usage": str(size)} for timestamp, size in data_usage.items()]

    with open(json_file, 'w') as f:
        json.dump(data_usage_list, f, indent=4)

def export_packets(stdscr, packet_data, interface_name):
    if not packet_data:
        return "Žiadne pakety na export."
    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    sanitized_interface = sanitize_filename(interface_name)
    base_export_path = os.path.join(export_dir, f"zachytavanie_{sanitized_interface}_{timestamp}")
    curses.echo()
    curses.curs_set(1)
    max_y, max_x = stdscr.getmaxyx()
    popup_height = 7
    popup_width = 40
    popup_y = max_y // 2 - popup_height // 2
    popup_x = max_x // 2 - popup_width // 2

    popup = curses.newwin(popup_height, popup_width, popup_y, popup_x)
    popup.box()
    popup.addstr(1, 2, "Vyberte formát exportu:")
    popup.addstr(2, 2, "1. CSV")
    popup.addstr(3, 2, "2. JSON")
    popup.addstr(4, 2, "3. Oba")
    popup.addstr(5, 2, "Voľba (1-3): ")
    popup.refresh()
    choice = popup.getstr(5, 15, 1).decode('utf-8')
    curses.noecho()
    curses.curs_set(0)
    popup.clear()
    popup.refresh()
    try:
        choice = int(choice)
        if choice < 1 or choice > 3:
            return "Neplatná voľba. Export nebol vykonaný."
    except ValueError:
        return "Neplatný vstup. Export nebol vykonaný."

    exported_files = []
    if choice in [1, 3]:
        csv_path = f"{base_export_path}.csv"
        with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = packet_data[0].keys()
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for packet in packet_data:
                writer.writerow(packet)
        exported_files.append(csv_path)
    if choice in [2, 3]:
        json_path = f"{base_export_path}.json"
        with open(json_path, 'w', encoding='utf-8') as jsonfile:
            json.dump({"packets": packet_data}, jsonfile, indent=4)
        exported_files.append(json_path)
    if exported_files:
        return f"Exportovaných {len(packet_data)} paketov do: {', '.join(exported_files)}"
    else:
        return "Export nebol vykonaný."

def sanitize_filename(name):
    invalid_chars = ['\\', '/', ':', '*', '?', '"', '<', '>', '|', '{', '}']
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name


def sniff_packets(interface, packet_queue, stop_event, sniffing_event, packets_json_file, data_usage_json_file,
                  display_filter=""):
    asyncio.set_event_loop(asyncio.new_event_loop())
    if display_filter:
        capture = pyshark.LiveCapture(interface=interface, display_filter=display_filter)
    else:
        capture = pyshark.LiveCapture(interface=interface, display_filter="ip")
    packets = []
    data_usage = {}

    try:
        for packet in capture.sniff_continuously():
            if stop_event.is_set():
                break

            if not sniffing_event.is_set():
                continue

            try:
                timestamp = packet.sniff_time.strftime("%H:%M:%S")
                src_ip = packet.ip.src
                dst_ip = packet.ip.dst
                if hasattr(packet, 'udp'):
                    protocol = 'UDP'
                else:
                    protocol = packet.highest_layer
                size = int(packet.length)
                src_port = packet[packet.transport_layer].srcport if hasattr(packet, "transport_layer") else "-"
                dst_port = packet[packet.transport_layer].dstport if hasattr(packet, "transport_layer") else "-"
                payload = "N/A"

                try:
                    raw_protocols = ['TLS', 'QUIC', 'LLMNR', 'SSDP']
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

                            combined_payload = ', '.join(tcp_payload + extra_tcp_info) if (
                                        tcp_payload or extra_tcp_info) else "N/A"
                            payload = combined_payload
                        else:
                            for field_name in dir(protocol_layer):
                                if not field_name.startswith('_') and field_name not in ['field_names', 'layer_name']:
                                    field_value = getattr(protocol_layer, field_name)
                                    if isinstance(field_value, str) and len(field_value) > 0:
                                        payload = f"{field_name}: {field_value}"
                                        break
                    if payload == "N/A" and hasattr(packet, "frame_raw"):
                        raw_data = packet.frame_raw.value
                        printable_chars = ''.join(
                            chr(byte) if 32 <= byte <= 126 else '.' for byte in bytes.fromhex(raw_data))
                        payload = printable_chars[:30] + "..." if len(printable_chars) > 30 else printable_chars

                except Exception as e:
                    payload = f"Error extracting payload: {str(e)[:20]}"
                payload = clean_string(payload)
                if len(payload) > 40:
                    payload = payload[:37] + "..."

                packet_info = {
                    "timestamp": timestamp,
                    "src_ip": src_ip,
                    "dst_ip": dst_ip,
                    "protocol": protocol,
                    "src_port": src_port,
                    "dst_port": dst_port,
                    "size": size,
                    "payload": payload
                }

                packet_queue.put(packet_info)
                packets.append(packet_info)

                if timestamp in data_usage:
                    data_usage[timestamp] += size
                else:
                    data_usage[timestamp] = size

                if len(packets) % 10 == 0:
                    write_packets_to_json(packets, packets_json_file)
                    write_data_usage_to_json(data_usage, data_usage_json_file)

            except AttributeError as e:
                continue
    finally:
        capture.close()
        write_packets_to_json(packets, packets_json_file)
        write_data_usage_to_json(data_usage, data_usage_json_file)


def display_packets(stdscr, interface, filters):
    stdscr.clear()
    max_y, max_x = stdscr.getmaxyx()

    packet_queue = queue.Queue()
    stop_event = threading.Event()
    sniffing_event = threading.Event()
    sniffing_event.set()

    current_display_filter = ""
    json_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'live_visualisations')
    os.makedirs(json_dir, exist_ok=True)

    packets_json_file = os.path.join(json_dir, 'captured_packets.json')
    data_usage_json_file = os.path.join(json_dir, 'data_usage.json')

    sniff_thread = threading.Thread(target=sniff_packets,
                                    args=(interface, packet_queue, stop_event, sniffing_event, packets_json_file,
                                          data_usage_json_file),
                                    daemon=True)
    sniff_thread.start()
    all_packet_lines = []
    scroll_position = 0
    visible_lines = max_y - 12

    packet_count = 0

    stdscr.addstr(0, 0, f"Sledovanie paketov na rozhraní: {interface}")
    stdscr.addstr(2, 0,
                  "| Čas      | Zdrojová IP     | Cieľová IP      | Protokol | Porty          | Veľkosť      | Dáta ")
    stdscr.addstr(3, 0, "-" * 120)

    stdscr.timeout(100)

    while True:
        packets_added = False
        while not packet_queue.empty():
            packet_info = packet_queue.get()
            packet_count += 1

            packet_info_str = (f"| {packet_info['timestamp']} | "
                               f"{packet_info['src_ip']:<15} | {packet_info['dst_ip']:<15} | "
                               f"{packet_info['protocol']:<8} | {packet_info['src_port']:<5} -> {packet_info['dst_port']:<5} | "
                               f"{packet_info['size']:<5} bajtov | {packet_info['payload']}")

            wrapped_lines = wrap_text(packet_info_str, max_x - 2)

            for line in wrapped_lines:
                clean_line = clean_string(line)
                all_packet_lines.append(clean_line)
                packets_added = True
        if packets_added and sniffing_event.is_set():
            scroll_position = max(0, len(all_packet_lines) - visible_lines)
        for i in range(4, max_y - 8):
            stdscr.addstr(i, 0, " " * (max_x - 1))
        visible_end = min(len(all_packet_lines), scroll_position + visible_lines)
        for i, line_idx in enumerate(range(scroll_position, visible_end), start=4):
            stdscr.addstr(i, 0, all_packet_lines[line_idx])

        if len(all_packet_lines) > visible_lines:
            stdscr.addstr(max_y - 6, 0, " " * (max_x - 1))

            scroll_percent = int(scroll_position / (len(all_packet_lines) - visible_lines) * 100)
            scroll_status = f"Scroll: {scroll_percent}% (↑/↓ to scroll)"
            stdscr.addstr(max_y - 6, max_x - len(scroll_status) - 3, scroll_status)
        stdscr.addstr(max_y - 5, 0,
                      "MENU: A) Vizualizácia 2 zariadení podľa IP B) Filtrovanie C) Vizualizácia".center(max_x))
        stdscr.addstr(max_y - 4, 0, "D) Export (JSON/CSV) E) ŠTART/STOP zachytávania F) Ukončiť".center(max_x))

        packet_count_msg = f"Zachytené pakety: {packet_count}"
        stdscr.addstr(max_y - 3, 0, " " * (max_x - 1))
        stdscr.addstr(max_y - 3, 0, packet_count_msg.center(max_x))
        key = stdscr.getch()
        if key == curses.KEY_UP and scroll_position > 0:
            scroll_position -= 1
        elif key == curses.KEY_DOWN and scroll_position < len(all_packet_lines) - visible_lines:
            scroll_position += 1
        elif key == curses.KEY_PPAGE:
            scroll_position = max(0, scroll_position - visible_lines)
        elif key == curses.KEY_NPAGE:
            scroll_position = min(len(all_packet_lines) - visible_lines, scroll_position + visible_lines)
        elif key == ord('g'):
            scroll_position = 0
        elif key == ord('G'):
            scroll_position = max(0, len(all_packet_lines) - visible_lines)
        elif key == ord('A') or key == ord('a'):
            stdscr.clear()
            stdscr.refresh()

            subprocess.run([
                python_cmd, r"two_devices.py",
            ])
            return
        elif key == ord('B') or key == ord('b'):
            was_sniffing = sniffing_event.is_set()
            if was_sniffing:
                sniffing_event.clear()

            try:
                curses.endwin()
                subprocess.run([python_cmd, "filter.py", "live"])
                stdscr = curses.initscr()
                curses.noecho()
                curses.cbreak()
                stdscr.keypad(True)
                filter_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "filter.txt")
                if os.path.exists(filter_file):
                    with open(filter_file, "r") as f:
                        current_display_filter = f.read().strip()
                    stop_event.set()
                    if sniff_thread.is_alive():
                        sniff_thread.join()
                    all_packet_lines = []
                    scroll_position = 0
                    packet_count = 0
                    stop_event = threading.Event()
                    sniff_thread = threading.Thread(
                        target=sniff_packets,
                        args=(
                            interface, packet_queue, stop_event, sniffing_event, packets_json_file,
                            data_usage_json_file,
                            current_display_filter),
                        daemon=True
                    )
                    sniff_thread.start()
                    stdscr.addstr(max_y - 2, 0, f"Aplikovaný filter: {current_display_filter}".center(max_x))
                os.remove(filter_file)
            except Exception as e:
                stdscr.addstr(max_y - 2, 0, f"Chyba pri aplikovaní filtru: {str(e)}".center(max_x))
            if was_sniffing:
                sniffing_event.set()

            stdscr.refresh()
        elif key == ord('C') or key == ord('c'):
            stdscr.clear()
            stdscr.refresh()

            stdscr.addstr(0, 0, f"Sledovanie paketov na rozhraní: {interface}")
            stdscr.addstr(2, 0,
                          "| Čas      | Zdrojová IP     | Cieľová IP      | Protokol | Porty          | Veľkosť      | Dáta ")
            stdscr.addstr(3, 0, "-" * 120)
            if os.name == 'nt':
                process = subprocess.Popen(
                    [python_cmd, "live_visualisations_selector.py", json_dir],
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE
                )
            else:
                process = subprocess.Popen(
                    [python_cmd, "live_visualisations_selector.py", json_dir],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    start_new_session=True
                )
            stdscr.refresh()
        elif key == ord('D') or key == ord('d'):
            was_sniffing = sniffing_event.is_set()
            if was_sniffing:
                sniffing_event.clear()

            try:
                with open(packets_json_file, 'r') as f:
                    data = json.load(f)
                    packets_to_export = data.get("packets", [])

                if not packets_to_export:
                    status_msg = "Žiadne pakety dostupné na export."
                else:
                    status_msg = export_packets(stdscr, packets_to_export, interface)
                stdscr.addstr(max_y - 2, 0, " " * max_x)
                stdscr.addstr(max_y - 2, 0, status_msg[:max_x - 1].center(max_x))
                stdscr.refresh()
                curses.napms(2000)

            except Exception as e:
                stdscr.addstr(max_y - 2, 0, f"Chyba exportu: {str(e)[:max_x - 20]}".center(max_x))
            if was_sniffing:
                sniffing_event.set()

            stdscr.refresh()
        elif key == ord('E') or key == ord('e'):
            if sniffing_event.is_set():
                sniffing_event.clear()
                stdscr.addstr(max_y - 2, 0, " " * (max_x - 1))
                stdscr.addstr(max_y - 2, 0,
                              "Zachytávanie pozastavené. Stlačte E na obnovenie. ↑/↓ pre posúvanie.".center(max_x))
            else:
                sniffing_event.set()
                scroll_position = max(0, len(all_packet_lines) - visible_lines)
                stdscr.addstr(max_y - 2, 0, " " * (max_x - 1))
                stdscr.addstr(max_y - 2, 0, "Zachytávanie obnovené. Stlačte E na pozastavenie.".center(max_x))
            stdscr.refresh()
        elif key == ord('f') or key == ord('F'):
            stop_event.set()
            sniff_thread.join()

            write_packets_to_json([], packets_json_file)
            write_data_usage_to_json({}, data_usage_json_file)

            stdscr.addstr(max_y - 2, 0, "Zachytávanie zastavené.".center(max_x))
            stdscr.refresh()
            return

        stdscr.refresh()


def main():
    parser = argparse.ArgumentParser(description="Snímač paketov s rozhraním curses.")
    parser.add_argument("--interface", required=True, help="Sieťové rozhranie na zachytávanie")
    parser.add_argument("--pcap_file", help="PCAP súbor")
    args = parser.parse_args()
    curses.setupterm()

    curses.wrapper(display_packets, args.interface, args.pcap_file)


if __name__ == "__main__":
    main()