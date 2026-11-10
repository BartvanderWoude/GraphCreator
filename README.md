# GraphCreator

A browser-based editor for causal DAGs (directed acyclic graphs), made for epidemiologists. A DAG in GraphCreator is a documented model: variables carry a type, ordered levels, a description and a unit, and edges carry evidence and a note. Graphs are saved as versioned YAML files and can be imported from and exported to the [dagitty](https://www.dagitty.net) text format.

Everything runs in the browser. There is no backend, and graphs never leave your machine.

## Development

Requires Node 26 (see `.nvmrc`).

```sh
npm install
npm run dev
```

The design and the implementation plan are in [docs/SPEC.md](docs/SPEC.md).

## Licence

[MIT](LICENSE)
