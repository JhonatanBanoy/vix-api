const { Schema, model } = require("mongoose"); //1

const productSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  image: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  stock: {
    type: Number,
    default: 0,
  },
  // Categoría del catálogo (slug: audifonos, tecnologia, moda-hombre, ...)
  category: {
    type: String,
    default: "",
    trim: true,
  },
  // Precio anterior para mostrar descuentos. null = sin oferta.
  compareAtPrice: {
    type: Number,
    default: null,
    min: 0,
  },
  // Disponible en la tienda (false = oculto para los clientes)
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = model("Product", productSchema);

//termina aca 
