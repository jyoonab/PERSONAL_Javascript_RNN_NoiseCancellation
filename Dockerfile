# nginx 이미지를 사용합니다. 뒤에 tag가 없으면 latest 를 사용합니다.
FROM nginx

WORKDIR /app

RUN mkdir ./client
ADD ./client ./client

RUN rm /etc/nginx/conf.d/default.conf
COPY ./nginx.conf /etc/nginx/conf.d
EXPOSE 8443

CMD ["nginx", "-g", "daemon off;"]
