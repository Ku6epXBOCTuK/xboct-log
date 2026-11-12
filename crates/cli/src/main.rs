#![forbid(unsafe_code)]

use clap::Parser;

#[derive(Parser)]
#[command(name = "xboct-log", version)]
struct Cli {}

fn main() {
    Cli::parse();
}
