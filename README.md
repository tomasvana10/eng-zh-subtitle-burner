# eng-zh-subtitle-burner

A utility that transcribes a video’s audio into English, translates it into Chinese, and embeds both languages as subtitles directly into the video.

## Prerequisites

- NVIDIA GPU with CUDA
- 15 GB disk space

## Setup for Windows and WSL2

1. Install/update Windows NVIDIA drivers

2. On Windows, set up Docker Desktop
    1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
    2. During setup, ensure **"Use WSL 2 based engine"** is checked
    3. Navigate to Docker Desktop > Settings > Resources > WSL Integration
    4. Enable your WSL distro, e.g. Ubuntu

3. Ensure Docker has access to your GPU. If this fails, ensure your NVIDIA drivers are up to date.

```sh
docker run --rm --gpus all nvidia/cuda:12.4.1-runtime-ubuntu22.04 nvidia-smi
```

4. Clone and change directory into the repo:
    1. `git clone https://github.com/tomasvana10/eng-zh-subtitle-burner`
    2. `cd eng-zh-subtitle-burner`

5. Run the utility. This will take several minutes on the first run.

```sh
chmod +x run.sh
./run.sh ./input.mp4
```

