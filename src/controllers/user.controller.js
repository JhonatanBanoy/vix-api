const User = require("../models/user.model");
const bcrypt = require("bcryptjs");

// Obtener todos los usuarios (sin mostrar contraseñas)
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 }); // Excluir campo password
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({
      message: "Error al obtener los usuarios",
      error: error.message,
    });
  }
};

// Crear un nuevo usuario
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validar campos obligatorios
    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Faltan datos obligatorios (name, email o password)",
      });
    }

    // Verificar si el usuario ya existe
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        message: "Ya existe un usuario con ese correo electrónico",
      });
    }

    // Crear el nuevo usuario
    const newUser = new User({ name, email, password, role });
    await newUser.save();

    // Excluir contraseña en respuesta
    const { password: _, ...userWithoutPassword } = newUser.toObject();

    res.status(201).json({
      message: "Usuario creado exitosamente",
      user: userWithoutPassword,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error al crear el usuario",
      error: error.message,
    });
  }
};

// Obtener perfil del usuario autenticado
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error en el servidor' });
  }
};

// Actualizar perfil del usuario autenticado
const updateProfile = async (req, res) => {
  try {
    const { name, email, password, profileImage } = req.body;
    const updateData = { name, email };
    if (profileImage) {
      updateData.profileImage = profileImage;
    }
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error en el servidor' });
  }
};


module.exports = {
  getAllUsers,
  createUser,
  getProfile,
  updateProfile,
};
