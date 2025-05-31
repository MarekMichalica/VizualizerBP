import matplotlib.pyplot as plt
import networkx as nx
from collections import Counter
import os

def plot_network_topology(filtered_packets, pcap_file):
    packets = filtered_packets
    G = nx.DiGraph()
    connection_counts = Counter()
    protocols = {}
    for packet in packets:
        src_ip = packet["src_ip"]
        dst_ip = packet["dst_ip"]
        protocol = packet["protocol"]
        if src_ip == "N/A" or dst_ip == "N/A":
            continue
        if src_ip not in G:
            G.add_node(src_ip)
        if dst_ip not in G:
            G.add_node(dst_ip)
        connection_key = (src_ip, dst_ip)
        connection_counts[connection_key] += 1
        protocols[connection_key] = protocol
    for (src, dst), count in connection_counts.items():
        protocol = protocols.get((src, dst), "Unknown")
        G.add_edge(src, dst, weight=count, protocol=protocol)
    if len(G.nodes()) == 0:
        plt.figure(figsize=(8, 4))
        plt.text(0.5, 0.5, "Žiadne dáta o sieťovej topológii nie sú k dispozícii",
                 horizontalalignment='center', fontsize=12)
        plt.tight_layout()
        plt.show()
        return

    plt.figure(figsize=(10, 6))
    pos = nx.spring_layout(G, k=0.3, iterations=30, seed=42)

    node_sizes = {}
    for node in G.nodes():
        connections = len(list(G.in_edges(node))) + len(list(G.out_edges(node)))
        node_sizes[node] = 100 if connections <= 2 else 200
    nx.draw_networkx_nodes(G, pos, node_size=[node_sizes[node] for node in G.nodes()],
                           node_color='lightblue', alpha=0.7)
    nx.draw_networkx_edges(G, pos, width=1, alpha=0.6, edge_color='grey',
                           arrowsize=10)
    nx.draw_networkx_labels(G, pos, font_size=7, font_family='sans-serif')
    edge_labels = {(u, v): data['protocol'] for u, v, data in G.edges(data=True)}
    nx.draw_networkx_edge_labels(G, pos, edge_labels=edge_labels, font_size=6,
                                 font_color='darkblue', alpha=0.7)
    file_name = os.path.basename(pcap_file)
    plt.title(f"Sieťová topológia - {file_name}", fontsize=12)
    plt.axis('off')

    plt.tight_layout()
    plt.show()