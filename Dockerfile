FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip fonts-noto-cjk curl ca-certificates xz-utils \
    && rm -rf /var/lib/apt/lists/*

# ffmpeg with NVENC/NVDEC + libass support (static build)
RUN mkdir -p /tmp/ff && cd /tmp/ff \
    && curl -L -o ff.tar.xz https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz \
    && tar -xf ff.tar.xz \
    && cp */bin/ffmpeg */bin/ffprobe /usr/local/bin/ \
    && cd / && rm -rf /tmp/ff

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility,video

RUN pip3 install --no-cache-dir faster-whisper torch --extra-index-url https://download.pytorch.org/whl/cu124

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY translate.ts whisper.py ./
RUN npx tsc
RUN cp whisper.py dist/

WORKDIR /data

ENTRYPOINT ["node", "/app/dist/translate.js"]
