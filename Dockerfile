FROM node:alpine
WORKDIR /node
COPY package.json /node
RUN npm install
COPY bot.js /node
COPY twitch.png /node
CMD npm start
EXPOSE 80
