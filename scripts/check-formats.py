"""Writes the exchange-format reference (spec 4.15, phase 40) with the real tools.

Development-time only; CI never runs it. For every sample in
src/model/__fixtures__/formats/samples (written by GraphCreator's own writers, see
src/model/formats.reference.test.ts) it records what each tool reads:

- networkx_gml: networkx.parse_gml(<sample>.gml, label="label"), as DoWhy reads GML;
- networkx_json: networkx.node_link_graph(<sample>.json, edges="edges");
- pydot: pydot.graph_from_dot_data(<sample>.dot), quotes and escapes removed;
- causallearn: causallearn's txt2generalgraph(<sample>.tetrad.txt), directed edges as [tail, head];
- bnlearn and dagitty: from scripts/check-formats.R (run here with Rscript).

Install once, outside the repository (uv, because Ubuntu's python3 has no ensurepip):
  uv venv ~/.venvs/graphcreator-formats --python 3.12
  uv pip install --python ~/.venvs/graphcreator-formats networkx pydot causal-learn
and the R packages listed in scripts/check-formats.R. Run from the repository root:
  ~/.venvs/graphcreator-formats/bin/python scripts/check-formats.py
"""

import json
import platform
import subprocess
import sys
from importlib.metadata import version
from pathlib import Path

import networkx as nx
import pydot
from causallearn.graph.Endpoint import Endpoint
from causallearn.utils.TXT2GeneralGraph import txt2generalgraph

ROOT = Path("src/model/__fixtures__/formats")
SAMPLES = ROOT / "samples"
if not SAMPLES.is_dir():
    sys.exit("Run this script from the repository root.")


def plain(value):
    """A JSON-safe copy of a networkx attribute value."""
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    return value


def nx_graph(g):
    return {
        "nodes": {str(n): plain(a) for n, a in g.nodes(data=True)},
        "edges": [[str(s), str(t), plain(a)] for s, t, a in g.edges(data=True)],
    }


def unquote(text):
    """A DOT id or value as written, without its quotes and backslash escapes."""
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        out, i, body = [], 0, text[1:-1]
        while i < len(body):
            if body[i] == "\\" and i + 1 < len(body) and body[i + 1] in '"\\':
                out.append(body[i + 1])
                i += 2
            else:
                out.append(body[i])
                i += 1
        return "".join(out)
    return text


def dot_graph(text):
    (g,) = pydot.graph_from_dot_data(text)
    nodes = {}
    for n in g.get_nodes():
        if n.get_name() in ("node", "edge", "graph"):
            continue  # default attribute statements
        nodes[unquote(n.get_name())] = {k: unquote(v) for k, v in n.get_attributes().items()}
    edges = [
        [
            unquote(e.get_source()),
            unquote(e.get_destination()),
            {k: unquote(v) for k, v in e.get_attributes().items()},
        ]
        for e in g.get_edges()
    ]
    return {"nodes": nodes, "edges": edges}


def tetrad_graph(path):
    g = txt2generalgraph(str(path))
    edges = []
    for e in g.get_graph_edges():
        a, b = e.get_node1().get_name(), e.get_node2().get_name()
        e1, e2 = e.get_endpoint1(), e.get_endpoint2()
        if e1 == Endpoint.TAIL and e2 == Endpoint.ARROW:
            edges.append([a, b])
        elif e1 == Endpoint.ARROW and e2 == Endpoint.TAIL:
            edges.append([b, a])
        else:
            edges.append([a, b, str(e1), str(e2)])
    return {"nodes": [n.get_name() for n in g.get_nodes()], "edges": edges}


def main():
    r = json.loads(
        subprocess.run(
            ["Rscript", "scripts/check-formats.R"],
            check=True,
            capture_output=True,
            encoding="utf-8",
        ).stdout
    )
    samples = {}
    for gml in sorted(SAMPLES.glob("*.gml")):
        name = gml.name[: -len(".gml")]
        read = lambda suffix: (SAMPLES / f"{name}{suffix}").read_text(encoding="utf-8")
        samples[name] = {
            "networkx_gml": nx_graph(nx.parse_gml(read(".gml"), label="label")),
            "networkx_json": nx_graph(nx.node_link_graph(json.loads(read(".json")), edges="edges")),
            "pydot": dot_graph(read(".dot")),
            "causallearn": tetrad_graph(SAMPLES / f"{name}.tetrad.txt"),
            **r["samples"][name],
        }
    reference = {
        "tools": {
            "python": platform.python_version(),
            "networkx": nx.__version__,
            "pydot": pydot.__version__,
            "causal-learn": version("causal-learn"),
            **r["tools"],
        },
        "samples": samples,
    }
    out = ROOT / "reference.json"
    out.write_text(json.dumps(reference, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {out} ({len(samples)} samples).")


if __name__ == "__main__":
    main()
