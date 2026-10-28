# @tetherto/mdk compat shim

`emcd-mdk-worker`, `spiderpool-mdk-worker` and `foundry-mdk-worker` declare `@tetherto/mdk` (this
monorepo, installed from git) as a peer dependency and require its packages by
path, for example `@tetherto/mdk/backend/core/mdk`. That name is not on the npm
registry, and inside this workspace the monorepo root is never linked into
`node_modules`. Without this package npm tries to auto-install the peer
dependency from the registry and `npm install` fails with E404.

Each file here re-exports the matching workspace package, so the workers run
on the same `@tetherto/mdk-core`, `@tetherto/mdk-worker`, and
`@tetherto/mdk-kernel` as the rest of the example. Add a file when a worker
starts requiring a new monorepo path.
