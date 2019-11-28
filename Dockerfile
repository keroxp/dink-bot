FROM debian:stretch
RUN apt update -y && apt install curl git -y
ARG DENO_VERSION=v0.24.0
ENV DENO_DIR=/deno
ENV DENO_INSTALL=${DENO_DIR}/.deno
ENV PATH=${DENO_INSTALL}/bin:${PATH}
RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s -- ${DENO_VERSION}
COPY . /src
RUN deno fetch /src/main.ts
WORKDIR /src
ENTRYPOINT [ "deno", "-A", "/src/main.ts"]
