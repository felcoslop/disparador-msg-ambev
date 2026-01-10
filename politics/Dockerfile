# Usar a imagem oficial do Nginx como base
FROM nginx:alpine

# Copiar os arquivos estáticos para o diretório padrão do Nginx
COPY . /usr/share/nginx/html/

# Expor a porta 80
EXPOSE 80

# O Nginx inicia automaticamente
CMD ["nginx", "-g", "daemon off;"]
