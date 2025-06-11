# AWS Lambda Node.js 18 base image
FROM public.ecr.aws/lambda/nodejs:18

# Install system dependencies
RUN yum update -y && \
    yum install -y \
    tar \
    xz \
    gzip \
    wget \
    which && \
    yum clean all

# Install FFmpeg from static build (ARM64 compatible)
RUN cd /tmp && \
    # Detect architecture and download appropriate FFmpeg build
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
        wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-arm64-static.tar.xz && \
        tar -xf ffmpeg-release-arm64-static.tar.xz && \
        mv ffmpeg-*-arm64-static/ffmpeg /usr/local/bin/ && \
        mv ffmpeg-*-arm64-static/ffprobe /usr/local/bin/; \
    else \
        wget https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
        tar -xf ffmpeg-release-amd64-static.tar.xz && \
        mv ffmpeg-*-amd64-static/ffmpeg /usr/local/bin/ && \
        mv ffmpeg-*-amd64-static/ffprobe /usr/local/bin/; \
    fi && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe && \
    rm -rf /tmp/ffmpeg*

# Create app directory
WORKDIR ${LAMBDA_TASK_ROOT}

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code and build artifacts
COPY dist/ ./dist/

# Verify FFmpeg installation
RUN /usr/local/bin/ffmpeg -version

# Set the CMD to your handler
CMD ["dist/index.handler"]
