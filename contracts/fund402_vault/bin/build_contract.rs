#![doc = "Binary for building wasm files from odra contracts."]
#![no_std]
#![no_main]
#![allow(unused_imports, clippy::single_component_path_imports)]
// Importing the contract crate links its `#[no_mangle]` WASM entry points
// (call/init/borrow_and_pay/…), which the `#[odra::module]` macro emits when
// `ODRA_MODULE` + `ODRA_BACKEND=casper` are set (see build.rs). `#![no_main]`
// keeps `main` out of the wasm so those entry points are the only exports.
use fund402_vault;
