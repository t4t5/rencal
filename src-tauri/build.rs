use std::fs;
use std::path::Path;

fn main() {
    generate_migrations();
    tauri_build::build()
}

fn generate_migrations() {
    let migrations_dir = Path::new("src/migrations");
    let out_file = Path::new("src/migrations.rs");

    println!("cargo:rerun-if-changed=src/migrations");

    let mut files: Vec<_> = fs::read_dir(migrations_dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().extension().is_some_and(|x| x == "sql"))
        .collect();

    files.sort_by_key(|e| e.file_name());

    let mut code = String::from(
        "/// This file is auto-generated. Do not edit directly.\n\
         use tauri_plugin_sql::{Migration, MigrationKind};\n\n\
         pub fn get_migrations() -> Vec<Migration> {\n    vec![\n",
    );

    for (i, entry) in files.iter().enumerate() {
        let filename = entry.file_name();
        let name = filename.to_str().unwrap();
        let desc = name
            .trim_end_matches(".sql")
            .split('_')
            .skip(1)
            .collect::<Vec<_>>()
            .join(" ");

        code.push_str(&format!(
            "        Migration {{
            version: {},
            description: \"{}\",
            sql: include_str!(\"migrations/{}\"),
            kind: MigrationKind::Up,
        }},
",
            i + 1,
            desc,
            name
        ));
    }

    code.push_str("    ]\n}\n");
    fs::write(out_file, code).unwrap();
}
