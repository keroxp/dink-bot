FROM debian:stretch
RUN apt update -y && apt install curl unzip git -y
ARG DENO_VERSION
ENV DENO_DIR=/deno
ENV DENO_INSTALL=${DENO_DIR}/.deno
ENV PATH=${DENO_INSTALL}/bin:${PATH}
RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s -- ${DENO_VERSION} \
    && deno -V
COPY . /src
RUN deno cache /src/main.ts
WORKDIR /src
ENTRYPOINT [ "deno", "-A", "/src/main.ts"]
