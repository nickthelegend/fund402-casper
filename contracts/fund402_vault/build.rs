//! Odra contract build script.
//! Reads the `ODRA_MODULE` env var (set by `cargo odra build`) and sets the
//! `odra_module` cfg flag so the `#[odra::module]` macro emits the contract's
//! WASM entry points (`call`, `init`, `borrow_and_pay`, …).
pub fn main() {
    odra_build::build();
}
