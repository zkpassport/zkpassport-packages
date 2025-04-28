# ZKPassport Registry Explorer

## Developing

Build the `@zkpassport/registry` package:

```bash
cd packages/registry-sdk
bun run build
```

Start anvil, deploy contracts and update roots (in a new window):

```bash
cd packages/registry-contracts
script/bash/run-and-deploy.sh
```

Start the development server for the Registry Explorer:

```bash
cd packages/registry-explorer
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the Registry Explorer.
