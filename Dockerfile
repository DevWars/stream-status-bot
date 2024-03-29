FROM node:20.8.0-alpine
ENV NODE_ENV=production
WORKDIR /node
RUN echo 'unsafe-perm = true' > /node/.npmrc
COPY package.json package-lock.json /node/
RUN npm install
COPY twitch.png /node/
ADD src/ /node/src/
CMD npm start
EXPOSE 80
HEALTHCHECK --interval=60s --timeout=10s CMD wget --tries=1 --spider http://localhost:80/health/ || exit 1
