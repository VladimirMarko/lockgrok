{
  description = "lockgrok development shells";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";

  outputs = { nixpkgs, ... }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (system:
        let
          pkgs = import nixpkgs { inherit system; };
          mkShell = nodejs: pkgs.mkShellNoCC {
            packages = [ nodejs pkgs.git ];
          };
        in
        {
          # Keep the default Node major aligned with .nvmrc.
          default = mkShell pkgs.nodejs_24;
          node22 = mkShell pkgs.nodejs_22;
        });
    };
}
