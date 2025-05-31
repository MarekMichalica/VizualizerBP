import argparse
import time
import curses
import subprocess
import threading
import pyshark
import os
import json
import csv
import sys

from collections import Counter, defaultdict
from datetime import datetime, timedelta

python_cmd = sys.executable

def clean_string(input_str):
    return input_str.replace('\0', '')


def wrap_text(text, width):
    lines = []
    while len(text) > width:
        split_point = text.rfind(' ', 0, width)
        if split_point == -1:
            split_point = width
        lines.append(text[:split_point])
        text = text[split_point:].lstrip()
    lines.append(text)
    return lines

def export_packets(stdscr, packet_data, count, pcap_filename):
    displayed_packets = packet_data[:count]

    if not displayed_packets:
        return "Žiadne pakety na export."
    export_dir = "exports"
    os.makedirs(export_dir, exist_ok=True)
    base_filename = os.path.splitext(os.path.basename(pcap_filename))[0]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    base_export_path = os.path.join(export_dir, f"{base_filename}_{timestamp}")
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
        csv_path = f"{base_export_path}_pakety.csv"
        with open(csv_path, 'w', newline='', encoding='utf-8') as csvfile:
            fieldnames = displayed_packets[0].keys()
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for packet in displayed_packets:
                writer.writerow(packet)
        exported_files.append(csv_path)
    if choice in [2, 3]:
        json_path = f"{base_export_path}_pakety.json"
        with open(json_path, 'w', encoding='utf-8') as jsonfile:
            json.dump(displayed_packets, jsonfile, indent=4)
        exported_files.append(json_path)
    if exported_files:
        return f"Exportovaných {count} paketov do: {', '.join(exported_files)}"
    else:
        return "Export nebol vykonaný."

def analyze_packets(file_path, filters, display_filter=None):
    if display_filter:
        cap = pyshark.FileCapture(file_path, display_filter=display_filter)
    else:
        cap = pyshark.FileCapture(file_path)

    protocol_counts = Counter()
    filtered_packets = []
    data_usage = defaultdict(int)

    for packet in cap:
        try:
            if hasattr(packet, 'ip'):
                src_ip = packet.ip.src
                dst_ip = packet.ip.dst
            else:
                if filters and (filters.get('ip_a') or filters.get('ip_b')):
                    continue
                src_ip = "N/A"
                dst_ip = "N/A"
            if filters:
                if filters.get('ip_a') and filters.get('ip_b'):
                    if not ((src_ip == filters['ip_a'] and dst_ip == filters['ip_b']) or
                            (src_ip == filters['ip_b'] and dst_ip == filters['ip_a'])):
                        continue
                elif filters.get('ip_a'):
                    if src_ip != filters['ip_a'] and dst_ip != filters['ip_a']:
                        continue
                elif filters.get('ip_b'):
                    if src_ip != filters['ip_b'] and dst_ip != filters['ip_b']:
                        continue
            timestamp = packet.sniff_time.strftime("%Y-%m-%d %H:%M:%S")
            packet_size = int(packet.length) if hasattr(packet, 'length') else 0

            if hasattr(packet, 'udp'):
                protocol = 'UDP'
            else:
                protocol = packet.highest_layer
            src_port = "N/A"
            dst_port = "N/A"
            payload = "N/A"
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
            if payload == "N/A" and hasattr(packet, 'data'):
                try:
                    data_bytes = bytes.fromhex(packet.data.data)
                    printable_chars = ''.join(chr(b) if 32 <= b <= 126 else '.' for b in data_bytes)
                    payload = printable_chars[:30]
                except:
                    payload = "N/A"
            packet_info = {
                "timestamp": timestamp,
                "src_ip": src_ip,
                "dst_ip": dst_ip,
                "protocol": protocol,
                "src_port": src_port,
                "dst_port": dst_port,
                "size": packet_size,
                "payload": payload
            }

            filtered_packets.append(packet_info)
            protocol_counts[protocol] += 1
            data_usage[timestamp] += packet_size

        except Exception as e:
            print(f"Error processing packet: {e}")

    return {
        "protocol_counts": protocol_counts,
        "filtered_packets": filtered_packets,
        "data_usage": dict(data_usage)
    }


def main(stdscr):
    stdscr.clear()
    max_y, max_x = stdscr.getmaxyx()
    parser = argparse.ArgumentParser(description="Analýza PCAP súboru")
    parser.add_argument("pcap_file", type=str, help="Cesta k súboru PCAP")
    parser.add_argument("--ip_a", type=str, help="IP adresa prvého zariadenia (voliteľné)")
    parser.add_argument("--ip_b", type=str, help="IP adresa druhého zariadenia (voliteľné)")
    args = parser.parse_args()
    filters = {}
    if args.ip_a:
        filters["ip_a"] = args.ip_a
    if args.ip_b:
        filters["ip_b"] = args.ip_b
    if not filters:
        filters = None
    packets = analyze_packets(args.pcap_file, filters)
    total_packets = len(packets["filtered_packets"])

    previous_timestamp = None
    pause_start_time = None
    pause_total_duration = 0

    progress_bar_width = 50
    current_value = 0
    packet_lines = []
    remaining_packets = total_packets
    protocol_counts = {protocol: 0 for protocol in packets["protocol_counts"].keys()}
    stdscr.timeout(100)
    sniffing_event = threading.Event()
    sniffing_event.set()

    run_subprocess = False
    scroll_position = 0
    visible_lines = max_y - 13

    stdscr.addstr(0, 0, "Analýza PCAP súboru: " + args.pcap_file)
    status_msg = "Zachytávanie aktívne. Stlačte E na pozastavenie."

    packet_idx = 0
    real_start_time = time.time()
    processing_complete = False

    while True:
        key = stdscr.getch()
        if key == ord('F') or key == ord('f'):
            return
        elif key == ord('A') or key == ord('a'):
            curses.endwin()
            try:
                subprocess.run([python_cmd, r"two_devices.py"])
            except Exception as e:
                print(f"Error running two_devices.py: {e}")
            finally:
                stdscr = curses.initscr()
                stdscr.clear()
                stdscr.refresh()
            return
        elif key == ord('B') or key == ord('b'):
            original_sniffing_state = sniffing_event.is_set()
            if original_sniffing_state:
                sniffing_event.clear()

            try:
                curses.endwin()
                subprocess.run([python_cmd, "filter.py", args.pcap_file])
                stdscr = curses.initscr()
                curses.start_color()
                curses.curs_set(0)
                stdscr.timeout(100)
                filter_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "filter.txt")
                if os.path.exists(filter_file):
                    with open(filter_file, "r") as f:
                        display_filter = f.read().strip()

                    if display_filter:
                        status_msg = f"Aplikované filtre: {display_filter}"
                        protocol_counts = {}
                        packet_lines = []
                        scroll_position = 0
                        current_value = 0
                        packet_idx = 0
                        previous_timestamp = None
                        packets = analyze_packets(args.pcap_file, filters, display_filter=display_filter)
                        total_packets = len(packets["filtered_packets"])
                        remaining_packets = total_packets
                        protocol_counts = {protocol: 0 for protocol in packets["protocol_counts"].keys()}
                        processing_complete = False
                        status_msg = f"Aplikovaný filter: {display_filter}. Stlačte E na pozastavenie."
                    os.remove(filter_file)
            except Exception as e:
                stdscr.addstr(max_y - 3, 0, f"Chyba pri aplikovaní filtru: {str(e)}".center(max_x))
            if original_sniffing_state:
                sniffing_event.set()
            update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                           progress_bar_width, protocol_counts, packet_lines, scroll_position,
                           visible_lines, remaining_packets, status_msg)
        elif key == ord('C') or key == ord('c'):
            try:
                if os.name == 'nt':
                    process = subprocess.Popen(
                        [python_cmd, "static_visualisations_selector.py", args.pcap_file],
                        creationflags=subprocess.CREATE_NEW_CONSOLE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE
                    )
                else:
                    process = subprocess.Popen(
                        [python_cmd, "static_visualisations_selector.py", args.pcap_file],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        start_new_session=True
                    )
                status_msg = "Vizualizácia spustená v novom okne. Pokračujte v práci v tomto okne."

            except Exception as e:
                status_msg = f"Chyba pri spustení vizualizácie: {str(e)}"
            update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                           progress_bar_width, protocol_counts, packet_lines, scroll_position,
                           visible_lines, remaining_packets, status_msg)
            continue
        elif key == ord('D') or key == ord('d'):
            original_sniffing_state = sniffing_event.is_set()
            if original_sniffing_state:
                sniffing_event.clear()

            try:
                export_msg = export_packets(stdscr, packets["filtered_packets"], packet_idx, args.pcap_file)
                status_msg = export_msg
                stdscr.addstr(max_y - 2, 0, status_msg[:max_x - 1].center(max_x))
                stdscr.refresh()
                time.sleep(2)
                if processing_complete:
                    status_msg = "Zachytávanie dokončené. Použite menu možnosti alebo F pre koniec."
                else:
                    status_msg = "Zachytávanie aktívne. Stlačte E na pozastavenie." if original_sniffing_state else "Zachytávanie pozastavené. Stlačte E na obnovenie. ↑/↓ pre posúvanie."

            except Exception as e:
                status_msg = f"Chyba exportu: {str(e)}"
                stdscr.addstr(max_y - 2, 0, status_msg[:max_x - 1].center(max_x))
                stdscr.refresh()
                time.sleep(2)
            if original_sniffing_state:
                sniffing_event.set()
            update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                           progress_bar_width, protocol_counts, packet_lines, scroll_position,
                           visible_lines, remaining_packets, status_msg)
            continue
        elif key == curses.KEY_UP and scroll_position > 0:
            scroll_position -= 1
            update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                           progress_bar_width, protocol_counts, packet_lines, scroll_position,
                           visible_lines, remaining_packets, status_msg)
            continue
        elif key == curses.KEY_DOWN and scroll_position < max(0, len(packet_lines) - visible_lines):
            scroll_position += 1
            update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                           progress_bar_width, protocol_counts, packet_lines, scroll_position,
                           visible_lines, remaining_packets, status_msg)
            continue
        elif key == ord('E') or key == ord('e'):
            if not processing_complete:
                if sniffing_event.is_set():
                    sniffing_event.clear()
                    pause_start_time = time.time()
                    status_msg = "Zachytávanie pozastavené. Stlačte E na obnovenie. ↑/↓ pre posúvanie."
                else:
                    sniffing_event.set()
                    if pause_start_time:
                        pause_duration = time.time() - pause_start_time
                        pause_total_duration += pause_duration
                        pause_start_time = None
                    status_msg = "Zachytávanie obnovené. Stlačte E na pozastavenie."
            stdscr.addstr(max_y - 2, 0, status_msg.center(max_x))
            stdscr.refresh()

        if processing_complete:
            time.sleep(0.1)
            continue
        if not sniffing_event.is_set():
            time.sleep(0.1)
            continue

        if packet_idx < total_packets:
            packet_info = packets["filtered_packets"][packet_idx]
            current_timestamp = datetime.strptime(packet_info["timestamp"], "%Y-%m-%d %H:%M:%S")

            if previous_timestamp:
                delta_time = (current_timestamp - previous_timestamp).total_seconds()
            previous_timestamp = current_timestamp

            current_value += 1
            remaining_packets -= 1
            protocol = packet_info["protocol"]
            protocol_counts[protocol] = protocol_counts.get(protocol, 0) + 1
            packet_info_str = (
                f"{packet_idx + 1:<2} | {packet_info['timestamp']} | {packet_info['src_ip']:<15} | {packet_info['dst_ip']:<15} | "
                f"{protocol:<8} | {packet_info['src_port']} -> {packet_info['dst_port']} | "
                f"{packet_info['size']:<5} bytes | {packet_info['payload']}")
            wrapped_lines = wrap_text(packet_info_str, max_x - 2)
            for line in wrapped_lines:
                clean_line = clean_string(line)
                packet_lines.append(clean_line)
            if len(packet_lines) > visible_lines:
                scroll_position = len(packet_lines) - visible_lines
            packet_idx += 1
            if packet_idx >= total_packets:
                processing_complete = True
                status_msg = "Zachytávanie dokončené. Použite menu možnosti alebo F pre koniec."
        update_display(stdscr, max_x, max_y, args.pcap_file, current_value, total_packets,
                       progress_bar_width, protocol_counts, packet_lines, scroll_position,
                       visible_lines, remaining_packets, status_msg)


def update_display(stdscr, max_x, max_y, pcap_file, current_value, total_packets,
                   progress_bar_width, protocol_counts, packet_lines, scroll_position,
                   visible_lines, remaining_packets, status_msg):
    stdscr.clear()
    stdscr.addstr(0, 0, "Analýza PCAP súboru: " + pcap_file)
    num_hashes = int((current_value / total_packets) * progress_bar_width)
    progress_bar = f"Progress: [{'#' * num_hashes}{' ' * (progress_bar_width - num_hashes)}] {current_value}/{total_packets}"
    stdscr.addstr(1, 0, progress_bar)

    top_protocols = sorted(protocol_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    protocol_y_offset = 2
    for protocol, count in top_protocols:
        if count > 0:
            protocol_percentage = (count / current_value) * 100 if current_value > 0 else 0
            num_hashes_protocol = int((protocol_percentage / 100) * progress_bar_width)
            protocol_bar = f"{protocol}: [{'#' * num_hashes_protocol}{' ' * (progress_bar_width - num_hashes_protocol)}] {protocol_percentage:.2f}%"
            stdscr.addstr(protocol_y_offset, 0, protocol_bar)
            protocol_y_offset += 1
    stdscr.addstr(protocol_y_offset, 0, "# | Časová pečiatka      | Zdrojová IP     | Cieľová IP      | Protokol | Porty       | Veľkosť     | Dáta ")
    stdscr.addstr(protocol_y_offset + 1, 0, "-" * 140)
    visible_end = min(len(packet_lines), scroll_position + visible_lines)
    for i, line_idx in enumerate(range(scroll_position, visible_end), start=protocol_y_offset + 2):
        if line_idx < len(packet_lines):
            stdscr.addstr(i, 0, packet_lines[line_idx])
    stdscr.addstr(max_y - 5, 0, f"Zostávajúce pakety: {remaining_packets}".center(max_x))
    stdscr.addstr(max_y - 4, 0, "MENU: A) Vizualizácia 2 zariadení podľa IP B) Filtrovanie C) Vizualizácia".center(max_x))
    stdscr.addstr(max_y - 3, 0, "D) Export (JSON/CSV) E) ŠTART/STOP zachytávania F) Koniec".center(max_x))
    stdscr.addstr(max_y - 2, 0, status_msg.center(max_x))
    stdscr.refresh()


if __name__ == "__main__":
    curses.wrapper(main)