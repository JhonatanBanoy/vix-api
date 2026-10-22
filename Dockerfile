# Usar Node.js como base
FROM node:18-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar dependencias
COPY package.json package-lock.json ./

# Instalar dependencias (incluye nodemon, necesario para el modo dev)
RUN npm install

# Copiar el código fuente
COPY . .

# Exponer el puerto
EXPOSE 5000

# Comando para iniciar en producción
CMD ["npm", "start"]
