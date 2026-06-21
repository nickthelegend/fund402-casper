// Schema generation for `cargo odra schema`.
//
// odra-build 1.5's `schema(legacy_schema, schema)` takes the two generated
// schema payloads. `cargo odra schema` sets ODRA_MODULE and supplies them via
// codegen; this bin is NOT compiled by `cargo odra build` (which only runs
// build_contract.rs → wasm), so leaving it as a no-op does not block deployment.
// Regenerate with `cargo odra` tooling if you need the casper_contract_schemas
// JSON for explorers.
fn main() {}
