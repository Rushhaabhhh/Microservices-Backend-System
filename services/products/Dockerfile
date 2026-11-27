FROM node:20-alpine

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN yarn

COPY . .

RUN chown -R node:node /usr/src/app
USER node


EXPOSE 8000
EXPOSE 9202

CMD ["yarn", "start"]