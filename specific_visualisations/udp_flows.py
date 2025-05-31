import json
import matplotlib.pyplot as plt
import networkx as nx
import os


def plot_udp_flows(data_input, pcap_file=None):
    packets = None

    if isinstance(data_input, str):
        try:
            if os.path.isfile(data_input):
                with open(data_input, 'r', encoding='utf-8') as f:
                    loaded = json.load(f)
                    if isinstance(loaded, list):
                        packets = loaded
                    elif isinstance(loaded, dict):
                        if "packets" in loaded:
                            packets = loaded["packets"]
                        else:
                            print("Neplatný formát JSON: očakávaný kľúč 'packets'")
                            return
                    else:
                        print("Neplatný formát JSON: očakávaný zoznam alebo slovník")
                        return
            else:
                print(f"Súbor {data_input} neexistuje")
                return
        except Exception as e:
            print(f"Chyba pri načítaní JSON: {e}")
            return
    elif isinstance(data_input, dict):
        if "packets" in data_input:
            packets = data_input["packets"]
        else:
            packets = [data_input]  
    elif isinstance(data_input, list):
        packets = data_input
    else:
        print(f"Neplatný vstup pre vizualizáciu: {type(data_input)}")
        return

    if not packets:
        print("Žiadne pakety na zobrazenie")
        return
    udp_packets = [p for p in packets if p.get('protocol') == 'UDP']
    if not udp_packets:
        print("Žiadne UDP pakety na zobrazenie")
        return
    flow_map = {}
    for pkt in udp_packets:
        src_ip = pkt.get('src_ip')
        dst_ip = pkt.get('dst_ip')
        src_port = pkt.get('src_port', '?')
        dst_port = pkt.get('dst_port', '?')
        size = int(pkt.get('size', 0))

        if not src_ip or not dst_ip:
            continue

        flow_key = f"{src_ip}:{src_port}->{dst_ip}:{dst_port}"
        if flow_key not in flow_map:
            flow_map[flow_key] = {
                'source': src_ip,
                'source_port': src_port,
                'target': dst_ip,
                'target_port': dst_port,
                'packets': 1,
                'bytes': size
            }
        else:
            flow_map[flow_key]['packets'] += 1
            flow_map[flow_key]['bytes'] += size
    flows = sorted(flow_map.values(), key=lambda x: x['packets'], reverse=True)[:15]
    if not flows:
        print("Žiadne dostupné dátové toky")
        return
    G = nx.DiGraph()

    source_nodes = set()
    target_nodes = set()

    for flow in flows:
        src_id = f"src_{flow['source']}"
        tgt_id = f"tgt_{flow['target']}"

        source_nodes.add(src_id)
        target_nodes.add(tgt_id)

        G.add_node(src_id, label=flow['source'], bipartite=0)
        G.add_node(tgt_id, label=flow['target'], bipartite=1)

        G.add_edge(src_id, tgt_id, weight=flow['packets'],
                   source_port=flow['source_port'], target_port=flow['target_port'],
                   bytes=flow['bytes'])
    pos = {}

    for i, node in enumerate(sorted(source_nodes)):
        pos[node] = (0, -i)

    for i, node in enumerate(sorted(target_nodes)):
        pos[node] = (1, -i)
    title = "Top dátové toky (UDP)"
    if pcap_file:
        title += f" - {os.path.basename(pcap_file)}"
    plt.figure(figsize=(12, 7))
    ax = plt.gca()
    ax.set_title(title)

    nx.draw_networkx_nodes(G, pos,
                           nodelist=source_nodes,
                           node_color='#69b3a2',
                           node_size=1000,
                           label='Source')

    nx.draw_networkx_nodes(G, pos,
                           nodelist=target_nodes,
                           node_color='#3498db',
                           node_size=1000,
                           label='Target')

    edges = G.edges(data=True)
    weights = [max(1, edge_data['weight'] / 2) for _, _, edge_data in edges]

    nx.draw_networkx_edges(G, pos, edge_color='#db4437', width=weights, alpha=0.6)

    labels = {node: G.nodes[node]['label'] for node in G.nodes()}
    nx.draw_networkx_labels(G, pos, labels, font_size=10)

    plt.axis('off')

    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor='#69b3a2', edgecolor='k', label='Source IP'),
        Patch(facecolor='#3498db', edgecolor='k', label='Target IP'),
        Patch(facecolor='#db4437', label='UDP Flow Links'),
    ]
    plt.legend(handles=legend_elements, loc='upper right')
    total_udp = len(udp_packets)
    info_text = f"Celkom UDP paketov: {total_udp}\nZobrazených tokov: {len(flows)}"
    plt.figtext(0.02, 0.02, info_text, fontsize=9)

    plt.tight_layout()
    plt.show()