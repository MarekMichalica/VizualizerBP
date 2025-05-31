import argparse
import curses
import os
import json

from live_visualisations.live_plot_protocols import plot_protocols
from live_visualisations.live_data_usage import plot_data_usage
from live_visualisations.live_top_senders_recievers import plot_top_senders_receivers
from live_visualisations.live_topology import plot_network_topology
from live_visualisations.live_packet_size_distribution import plot_packet_size_distribution
from live_visualisations.live_flow_analysis import plot_flow_analysis

from specific_visualisations.tcp_flags import plot_tcp_flags
from specific_visualisations.tcp_retransmissions import plot_tcp_retransmissions
from specific_visualisations.tcp_window_size import plot_tcp_window_size
from specific_visualisations.tcp_seq_ack import plot_tcp_seq_ack
from specific_visualisations.udp_flows import plot_udp_flows
from specific_visualisations.udp_size import plot_udp_size
from specific_visualisations.http_methods import plot_http_methods
from specific_visualisations.http_codes import plot_http_codes
from specific_visualisations.arp_freq import plot_arp_freq
from specific_visualisations.arp_count import plot_arp_count
from specific_visualisations.icmp_types import plot_icmp_types
from specific_visualisations.icmp_freq import plot_icmp_freq
from specific_visualisations.dns_time import plot_dns_time
from specific_visualisations.dns_domains import plot_dns_domains
from specific_visualisations.modbus_codes import plot_modbus_codes
from specific_visualisations.modbus_exceptions import plot_modbus_exceptions
from specific_visualisations.dnp3_objects import plot_dnp3_objects
from specific_visualisations.dnp3_events import plot_dnp3_events
from specific_visualisations.s7_racks import plot_s7_racks
from specific_visualisations.s7_functions import plot_s7_functions
general_vis_file_types = {
    "Objem dát v čase": "data_usage.json",
    "Distribúcia protokolov": "captured_packets.json",
    "Top odosielatelia a prijímatelia": "captured_packets.json",
    "Prepojenie aktívnych zariadení": "captured_packets.json",
    "Distribúcia veľkosti paketov": "captured_packets.json",
    "Analýza tokov": "captured_packets.json",
    "Distribúcia portov": "captured_packets.json",
    "Počet paketov v čase": "captured_packets.json"
}

protocol_visualizations = {
    "TCP": [
        "Distribúcia TCP vlajok (Stĺpcový graf)",
        "Opakované TCP prenosy (Bodový graf)",
        "Veľkosť TCP okna v čase (Čiarový graf)",
        "Progresia SEQ/ACK vlajok (Scatter plot)"
    ],
    "UDP": [
        "Najväčšie UDP toky (Sankey diagram)",
        "Distribúcia veľkostí UDP paketov (Histogram)"
    ],
    "ICMP": [
        "Rozdelenie ICMP Type správ (Koláčový graf)",
        "Frekvencia ICMP požiadaviek a odpovedí (Stĺpcový graf)"
    ],
    "DNS": [
        "Distribúcia času DNS odoziev (Histogram)",
        "Top vyhľadávané doménové mená (Stĺpcový graf)"
    ],
    "HTTP": [
        "Frekvencia HTTP metód (Stĺpcový graf)",
        "Distribúcia HTTP kódov (Stĺpcový graf)"
    ],
    "ARP": [
        "Frekvencia ARP požiadaviek a odpovedí (Stĺpcový graf)",
        "Počet ARP správ podľa IP adresy (Stĺpcový graf)"
    ],
    "Modbus": [
        "Distribúcia Modbus kódov (Stĺpcový graf)",
        "Frekvencia Modbus výnimok (Stĺpcový graf)"
    ],
    "DNP3": [
        "Používané typy DNP3 objektov (Stĺpcový graf)",
        "DNP3 udalosti podľa tried (Stĺpcový graf)"
    ],
    "S7": [
        "Používané S7 funkcie – read/write (Stĺpcový graf)",
        "Používanie S7 rackov a slotov (Heatmapa)"
    ]
}
protocol_vis_function_map = {
    "Distribúcia TCP vlajok (Stĺpcový graf)": plot_tcp_flags,
    "Opakované TCP prenosy (Bodový graf)": plot_tcp_retransmissions,
    "Veľkosť TCP okna v čase (Čiarový graf)": plot_tcp_window_size,
    "Progresia SEQ/ACK vlajok (Scatter plot)": plot_tcp_seq_ack,
    "Najväčšie UDP toky (Sankey diagram)": plot_udp_flows,
    "Distribúcia veľkostí UDP paketov (Histogram)": plot_udp_size,
    "Frekvencia HTTP metód (Stĺpcový graf)": plot_http_methods,
    "Distribúcia HTTP kódov (Stĺpcový graf)": plot_http_codes,
    "Frekvencia ARP požiadaviek a odpovedí (Stĺpcový graf)": plot_arp_freq,
    "Počet ARP správ podľa IP adresy (Stĺpcový graf)": plot_arp_count,
    "Rozdelenie ICMP Type správ (Koláčový graf)": plot_icmp_types,
    "Frekvencia ICMP požiadaviek a odpovedí (Stĺpcový graf)": plot_icmp_freq,
    "Distribúcia času DNS odoziev (Histogram)": plot_dns_time,
    "Top vyhľadávané doménové mená (Stĺpcový graf)": plot_dns_domains,
    "Distribúcia Modbus kódov (Stĺpcový graf)": plot_modbus_codes,
    "Frekvencia Modbus výnimok (Stĺpcový graf)": plot_modbus_exceptions,
    "Používané typy DNP3 objektov (Stĺpcový graf)": plot_dnp3_objects,
    "DNP3 udalosti podľa tried (Stĺpcový graf)": plot_dnp3_events,
    "Používané S7 funkcie – read/write (Stĺpcový graf)": plot_s7_functions,
    "Používanie S7 rackov a slotov (Heatmapa)": plot_s7_racks,
}


def protocol_visualization_menu(stdscr, protocol, visualizations, json_dir):
    current_selection = 0
    while True:
        stdscr.clear()
        stdscr.addstr(0, 0, f"Vizualizácie pre protokol {protocol}:", curses.A_BOLD)
        stdscr.addstr(1, 0, "0. <- Späť")

        for i, vis in enumerate(visualizations, start=1):
            if i == current_selection:
                stdscr.addstr(i + 1, 0, f"> {i}. {vis}", curses.A_REVERSE)
            else:
                stdscr.addstr(i + 1, 0, f"  {i}. {vis}")

        stdscr.addstr(len(visualizations) + 3, 0,
                      "Použite šípky na výber, ENTER pre potvrdenie, 'q' pre ukončenie.")
        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_UP and current_selection > 0:
            current_selection -= 1
        elif key == curses.KEY_DOWN and current_selection < len(visualizations):
            current_selection += 1
        elif key == ord('\n'):
            if current_selection == 0:
                return None
            else:
                selected_vis = visualizations[current_selection - 1]
                func = protocol_vis_function_map.get(selected_vis)
                if func:
                    captured_packets_json = os.path.join(json_dir, "captured_packets.json")
                    if os.path.isfile(captured_packets_json):
                        with open(captured_packets_json, 'r') as f:
                            data = json.load(f)
                        func(data)
                    else:
                        stdscr.clear()
                        stdscr.addstr(0, 0, f"Chyba: Súbor {captured_packets_json} neexistuje.")
                        stdscr.refresh()
                        stdscr.getch()
                else:
                    stdscr.clear()
                    stdscr.addstr(0, 0, "Vizualizácia nie je implementovaná.")
                    stdscr.refresh()
                    stdscr.getch()
        elif key == ord('q'):
            return "q"


def protocol_menu(stdscr, protocols):
    current_selection = 0
    while True:
        stdscr.clear()
        stdscr.addstr(0, 0, "Vyberte protokol:", curses.A_BOLD)
        stdscr.addstr(1, 0, "0. <- Späť")

        for i, protocol in enumerate(protocols, start=1):
            if i == current_selection:
                stdscr.addstr(i + 1, 0, f"> {i}. {protocol}", curses.A_REVERSE)
            else:
                stdscr.addstr(i + 1, 0, f"  {i}. {protocol}")

        stdscr.addstr(len(protocols) + 3, 0,
                      "Použite šípky na výber, ENTER pre potvrdenie, 'q' pre ukončenie.")
        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_UP and current_selection > 0:
            current_selection -= 1
        elif key == curses.KEY_DOWN and current_selection < len(protocols):
            current_selection += 1
        elif key == ord('\n'):
            if current_selection == 0:
                return None
            else:
                return protocols[current_selection - 1]
        elif key == ord('q'):
            return "q"


def select_visualization(stdscr, json_dir):
    visualizations = [
        "Objem dát v čase",
        "Distribúcia protokolov",
        "Top odosielatelia a prijímatelia",
        "Prepojenie aktívnych zariadení",
        "Distribúcia veľkosti paketov",
        "Analýza tokov",
        "Distribúcia portov",
        "Počet paketov v čase",
        "Výber špeciálnych vizualizácií na základe protokolu"
    ]

    protocols = [
        "TCP", "UDP", "ICMP", "DNS", "HTTP", "ARP", "Modbus", "DNP3", "S7"
    ]

    current_selection = 0
    while True:
        stdscr.clear()
        stdscr.addstr(0, 0, "Vyberte vizualizáciu:", curses.A_BOLD)

        for i, vis in enumerate(visualizations, start=1):
            if i - 1 == current_selection:
                stdscr.addstr(i, 0, f"> {i}. {vis}", curses.A_REVERSE)
            else:
                stdscr.addstr(i, 0, f"  {i}. {vis}")

        stdscr.addstr(len(visualizations) + 2, 0,
                      "Použite šípky na výber, ENTER pre potvrdenie, 'q' pre ukončenie.")
        stdscr.refresh()

        key = stdscr.getch()
        if key == curses.KEY_UP and current_selection > 0:
            current_selection -= 1
        elif key == curses.KEY_DOWN and current_selection < len(visualizations) - 1:
            current_selection += 1
        elif key == ord('\n'):
            selected_vis = visualizations[current_selection]
            if selected_vis == "Výber špeciálnych vizualizácií na základe protokolu":
                protocol = protocol_menu(stdscr, protocols)
                if protocol == "q" or protocol is None:
                    continue
                visualizations_for_protocol = protocol_visualizations.get(protocol, [])
                if not visualizations_for_protocol:
                    stdscr.clear()
                    stdscr.addstr(0, 0, f"Nenašli sa vizualizácie pre protokol {protocol}")
                    stdscr.refresh()
                    stdscr.getch()
                    continue
                result = protocol_visualization_menu(stdscr, protocol, visualizations_for_protocol, json_dir)
                if result == "q":
                    return "q"
            else:
                json_file_type = general_vis_file_types.get(selected_vis, "captured_packets.json")
                json_file_path = os.path.join(json_dir, json_file_type)

                if not os.path.isfile(json_file_path):
                    stdscr.clear()
                    stdscr.addstr(0, 0, f"Chyba: Súbor {json_file_path} neexistuje.")
                    stdscr.refresh()
                    stdscr.getch()
                    continue
                if selected_vis == "Objem dát v čase":
                    plot_data_usage(json_file_path)
                elif selected_vis == "Distribúcia protokolov":
                    plot_protocols(json_file_path)
                elif selected_vis == "Top odosielatelia a prijímatelia":
                    plot_top_senders_receivers(json_file_path)
                elif selected_vis == "Prepojenie aktívnych zariadení":
                    plot_network_topology(json_file_path)
                elif selected_vis == "Distribúcia veľkosti paketov":
                    plot_packet_size_distribution(json_file_path)
                elif selected_vis == "Analýza tokov":
                    plot_flow_analysis(json_file_path)
                elif selected_vis == "Distribúcia portov" or selected_vis == "Počet paketov v čase":
                    stdscr.clear()
                    stdscr.addstr(0, 0, "Táto vizualizácia zatiaľ nie je implementovaná.")
                    stdscr.refresh()
                    stdscr.getch()
                    continue
        elif key == ord('q'):
            return "q"


def main():
    parser = argparse.ArgumentParser(description="Live Visualizations for Network Data")
    parser.add_argument("json_dir",
                        help="Directory containing JSON data files (captured_packets.json and data_usage.json)")
    args = parser.parse_args()

    json_dir = args.json_dir
    if not os.path.isdir(json_dir):
        print(f"Adresár {json_dir} neexistuje.")
        return
    captured_packets_path = os.path.join(json_dir, "captured_packets.json")
    data_usage_path = os.path.join(json_dir, "data_usage.json")

    if not os.path.isfile(captured_packets_path):
        print(f"Súbor {captured_packets_path} neexistuje.")

    if not os.path.isfile(data_usage_path):
        print(f"Súbor {data_usage_path} neexistuje.")
    if os.path.isfile(captured_packets_path) or os.path.isfile(data_usage_path):
        curses.wrapper(lambda stdscr: select_visualization(stdscr, json_dir))
    else:
        print("Žiadne potrebné JSON súbory neboli nájdené v zadanom adresári.")


if __name__ == "__main__":
    main()