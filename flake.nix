{
  description = "WES 型实用堰泄流能力与堰流水面线计算程序（wes-hydraulic-calc）";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems =
        f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22
            pnpm
          ];

          shellHook = ''
            echo "wes-hydraulic-calc 开发环境"
            echo "  node $(node --version)   pnpm $(pnpm --version)"
            echo "  可用命令: pnpm dev | pnpm build | pnpm test | pnpm typecheck"
          '';
        };
      });
    };
}
