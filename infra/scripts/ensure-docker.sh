#!/bin/sh
# Sourced by setup.sh so a bundled Docker CLI can be added to its PATH.

docker_startup_fail() {
    printf 'Docker startup failed: %s\n' "$1" >&2
    exit 1
}

docker_is_ready() {
    command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

require_linux_docker() {
    docker_engine_type=$(docker info --format '{{.OSType}}') || docker_startup_fail 'Cannot read the Docker engine type.'
    [ "$docker_engine_type" = linux ] || docker_startup_fail 'This project requires Linux containers. Switch Docker Desktop to Linux-container mode, then rerun setup.'
}

ensure_docker() {
    if docker_is_ready; then
        require_linux_docker
        return
    fi

    docker_platform=$(uname -s)
    docker_in_wsl=false
    if [ "$docker_platform" = Linux ]; then
        case "$(uname -r)" in
            *[Mm]icrosoft*|*WSL*) docker_in_wsl=true ;;
        esac
        if [ -n "${WSL_DISTRO_NAME:-}" ]; then
            docker_in_wsl=true
        fi
    fi
    if [ "$docker_platform" = Darwin ] && ! command -v docker >/dev/null 2>&1; then
        for docker_cli_dir in /Applications/Docker.app/Contents/Resources/bin "$HOME/Applications/Docker.app/Contents/Resources/bin"; do
            if [ -x "$docker_cli_dir/docker" ]; then
                PATH="$docker_cli_dir:$PATH"
                export PATH
                break
            fi
        done
    fi

    # Do not replace a deliberately selected remote engine or another local runtime.
    [ -z "${DOCKER_HOST:-}" ] || docker_startup_fail 'The configured DOCKER_HOST is unavailable. Start that engine or correct its connection settings.'
    docker_selected_context=${DOCKER_CONTEXT:-default}
    if command -v docker >/dev/null 2>&1; then
        docker_selected_context=$(docker context show) || docker_startup_fail 'Cannot read the selected Docker context.'
    fi
    case "$docker_selected_context" in
        default|desktop-linux) ;;
        desktop-windows) docker_startup_fail 'This project needs Docker Desktop in Linux-container mode.' ;;
        *) docker_startup_fail 'Your selected Docker context is unavailable. Start that engine; setup will not switch contexts.' ;;
    esac
    if [ "$docker_platform" = Linux ] && [ "$docker_in_wsl" = false ] && [ "$docker_selected_context" = default ]; then
        docker_startup_fail 'Start your native Docker Engine service, or select Docker Desktop in its initial configuration, then rerun setup.'
    fi

    printf 'Starting Docker Desktop...\n'
    docker_desktop_started=false
    if command -v docker >/dev/null 2>&1 && docker desktop version >/dev/null 2>&1; then
        if docker desktop start --detach; then
            docker_desktop_started=true
        fi
    fi
    if [ "$docker_desktop_started" = false ]; then
        case "$docker_platform" in
            Darwin)
                open -a Docker || docker_startup_fail 'Install Docker Desktop from https://docs.docker.com/get-docker/ and complete its installation.'
                ;;
            Linux)
                if [ "$docker_in_wsl" = true ]; then
                    command -v powershell.exe >/dev/null 2>&1 || docker_startup_fail 'Windows interop is unavailable. Open Docker Desktop and enable WSL integration.'
                    powershell.exe -NoProfile -NonInteractive -Command '
                        $ErrorActionPreference = "Stop"
                        $paths = @(
                            "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe",
                            "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
                        )
                        $desktop = $paths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
                        if (-not $desktop) { throw "Docker Desktop was not found. Install it or open your custom installation manually." }
                        Start-Process -FilePath $desktop
                    ' || docker_startup_fail 'Could not open Docker Desktop. See infra/README.md.'
                else
                    if command -v systemctl >/dev/null 2>&1 && systemctl --user cat docker-desktop.service >/dev/null 2>&1; then
                        systemctl --user start docker-desktop || docker_startup_fail 'Could not start Docker Desktop.'
                    else
                        docker_startup_fail 'Install Docker Desktop, or start your native Docker Engine service and make it accessible to this terminal.'
                    fi
                fi
                ;;
            *) docker_startup_fail 'Open Docker Desktop manually, then rerun setup. Windows users should use a WSL 2 terminal.' ;;
        esac
    fi

    # Retry up to 60 times; time spent inside Docker CLI requests is additional.
    docker_waited=0
    until docker_is_ready; do
        [ "$docker_waited" -lt 120 ] || docker_startup_fail 'Docker did not become ready. Complete any Desktop first-launch prompts and check terminal access or WSL integration, then rerun setup.'
        if [ $((docker_waited % 20)) -eq 0 ]; then
            printf 'Waiting for Docker to be ready...\n'
        fi
        sleep 2
        docker_waited=$((docker_waited + 2))
    done
    require_linux_docker
    printf 'Docker is ready.\n'
}
