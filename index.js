const express = require('express');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bodyParser = require('body-parser');
require('dotenv').config();
const cors = require('cors');
const morgan = require('morgan');
const AppError = require('./appError');

const createAndWhere = (opt) => {
    return opt.length > 1
        ? {
            [Op.and]: [...opt],
        }
        : opt[0]
}

const app = express();
app.use(bodyParser.json());
app.use(morgan(':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] :response-time ms'))
app.use(
  cors({
      origin: [
          "http://localhost:3000",
          // Add production URL here when deploying
      ],
      credentials: true,
      methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposedHeaders: ["x-total-count"],
  })
)


// PostgreSQL bağlantısı
const sequelize = new Sequelize(process.env.DB_URL);

// Modeller
const User = sequelize.define('User', {
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  password: { type: DataTypes.STRING,  allowNull: true} ,
  name: DataTypes.STRING,
  phone: DataTypes.STRING,  
  address: DataTypes.STRING, 
  role: { type: DataTypes.ENUM('admin', 'customer'), defaultValue: 'customer' }
});

const Product = sequelize.define('Product', {
  name: { type: DataTypes.STRING, allowNull: false },
  price: DataTypes.FLOAT,
  description: DataTypes.TEXT,
  stock: DataTypes.INTEGER,    
  imageUrl: DataTypes.STRING,  
});

const Order = sequelize.define('Order', {
  totalPrice: { type: DataTypes.FLOAT, defaultValue: 0 },
  status: { type: DataTypes.ENUM('cart', 'completed'), defaultValue: 'cart' },
  orderStatus: { type: DataTypes.ENUM('başlangıç', 'işlemde', 'tamamlandı'), defaultValue: 'başlangıç' },
  trackingNumber: { type: DataTypes.STRING },
  adminNote: { type: DataTypes.TEXT },
  orderDate: DataTypes.DATE, // Eklenen alan
  address: DataTypes.STRING,  // Eklenen alan
});

const OrderItem = sequelize.define('OrderItem', {
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 }
});

const Category = sequelize.define('Category', {
    name: { type: DataTypes.STRING }
} );

User.hasMany(Order);
Order.belongsTo(User);

Order.hasMany(OrderItem);
OrderItem.belongsTo(Order);

Product.hasMany(OrderItem);
OrderItem.belongsTo(Product);

Category.hasMany(Product);
Product.belongsTo(Category);

// Senkronizasyon
sequelize.sync({ alter: true }).then(() => console.log("DB Synced"));

// ➕ Kullanıcı Kaydı
app.post('/register', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔑 Giriş (email kontrolü)
app.post('/login', async (req, res) => {
try {
  const { email, password } = req.body;
  const user = await User.findOne({ where: { email },include:[{model:Order, include:[{model: OrderItem,include:[{model:Product}]}]}] });
  if(!user) res.status(500).send({message:"Hatalı kullanıcı adı veya şifre"})
  if (user && user.password !== password ) res.status(500).send({message:"Hatalı şifre"})
  if (user && user.password === password ) res.json(user);
} catch (error) {
    console.log(error)
}
});

// 📦 Ürün CRUD
app.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/products', async (req, res) => {
  try {

    const opt = [];
    const { search, categoryId } = req.query;

    if(search) {
        opt.push({ name: { [Op.iLike]: `%${search}%` } })
    }

    if(categoryId) {
        opt.push({ CategoryId: parseInt(categoryId) })
    }

    const products = await Product.findAll({
      where: createAndWhere(opt),
    });

    res.json(products);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get('/products/:id', async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (product) res.json(product);
  else res.status(404).json({ error: 'Product not found' });
});

app.put('/products/:id', async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (product) {
    await product.update(req.body);
    res.json(product);
  } else res.status(404).json({ error: 'Product not found' });
});

app.delete('/products/:id', async (req, res) => {
  const product = await Product.findByPk(req.params.id);
  if (product) {
    await product.destroy();
    res.json({ message: 'Product deleted' });
  } else res.status(404).json({ error: 'Product not found' });
});

// 🛒 Sepet Mekanizması
app.post('/cart/add', async (req, res) => {
  const { userId, productId, quantity } = req.body;

  let order = await Order.findOne({ where: { userId, status: 'cart' } });
  if (!order) order = await Order.create({ userId });

  let item = await OrderItem.findOne({ where: { orderId: order.id, productId } });

  if (item) {
    await item.update({ quantity: item.quantity + quantity });
  } else {
    await OrderItem.create({ orderId: order.id, productId, quantity });
  }

  const items = await OrderItem.findAll({ where: { orderId: order.id }, include: Product });
  res.json(items);
});

app.post('/cart/remove', async (req, res) => {
  const { userId, productId } = req.body;

  let order = await Order.findOne({ where: { userId, status: 'cart' } });

  if (!order) return res.status(404).json({ error: 'Cart not found' });

  let item = await OrderItem.findOne({ where: { orderId: order.id, productId } });

  if (item) {
    await item.destroy();
    res.json({ message: 'Item removed from cart' });
  } else res.status(404).json({ error: 'Item not found' });
});

app.post('/orders', async (req, res) => {
 try {
  const {items, total,user} = req.body;
    console.log(req.body)
  const order = await Order.create({
    totalPrice: total,
    OrderStatus:"baslanıc",
    UserId: user.id,
    address: user.address || "no-address",
    orderDate: new Date()
    })
  
    for (let i = 0; i < items.length; i++) {
      const element = items[i];
      await OrderItem.create({
          quantity: element.quantity,
          OrderId: order.dataValues.id,
          ProductId: element.id
      })
    }

    let orders = await Order.findOne({
        where: { id:order.dataValues.id },
        include: [{model: OrderItem,include: [{model: Product}]}]
   })

//herşey bitince kullanıcıya ait bütün siparişleri çağır ve gönder
  res.json(orders);
 } catch (error) {
   console.log(error)
 }
});

app.put('/orders', async (req, res) => {
  try {
   const {id, address} = req.body;
     
   const order = await Order.findOne({where: {id: id}  })
   order.address = address;
   await order.save();
 
 //herşey bitince kullanıcıya ait bütün siparişleri çağır ve gönder
   res.json({ message: 'Order udapted' });
  } catch (error) {
    console.log(error)
  }
 });



// 📋 Admin Panel İşlemleri

// 1. Tüm Siparişleri Görüntüle (Statü ve alıcı adına göre filtreli)
app.get('/admin/orders', async (req, res) => {
  const { status, search } = req.query;

  let where = {};

  if (status) {
    where.orderStatus = status;
  }

  const orders = await Order.findAll({
    where,
    include: [{ model: User, where: search ? { name: { [Op.iLike]: `%${search}%` } } : {} }, { model: OrderItem, include: [Product] }]
  });

  res.json(orders);
});


app.delete('/admin/orders/:id', async (req,res)=> {

    await Order.destroy({where: { id: req.params.id}})

    res.json({ message: 'Order deleted' })
})

// 2. Sipariş Statü Güncelleme
app.post('/admin/orders/:id/status', async (req, res) => {
  const { id } = req.params;
  const { orderStatus } = req.body;

  const order = await Order.findByPk(id);

  if (!order) return res.status(404).json({ error: 'Order not found' });

  await order.update({ orderStatus });

  res.json({ message: 'Order status updated' });
});

// 3. Kullanıcı Listesi (admin hariç)
app.get('/admin/users', async (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL;

  const users = await User.findAll({
    where: {
      email: { [Op.ne]: adminEmail }
    }
  });

  res.json(users);
});

// 4. Sipariş Detayları (Kargo ve Admin Notu ekle)
app.post('/admin/orders/:id/details', async (req, res) => {
  const { id } = req.params;
  const { trackingNumber, adminNote } = req.body;

  try {
    const order = await Order.findByPk(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    await order.update({ trackingNumber, adminNote });

    res.json({ message: 'Order details updated', order });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/admin/category', async (req, res) => {
  try {
   const category = await Category.findAll();

    res.json(category);

  } catch (error) {
    console.log(error)
  }
 });

app.post('/admin/category', async (req, res) => {
  try {
   const { categoryName } = req.body;
   await Category.create({ name: categoryName || "" });

  res.json({ message: 'Category created successfully' });

  } catch (error) {
    console.log(error)
  }
 });

// 👤 Kullanıcının Profil ve Sipariş Geçmişi
app.get('/profile/:userId', async (req, res) => {
    const { userId } = req.params;
  
    try {
      const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'email', 'role'],
        include: [
          {
            model: Order,
            required: false, // Siparişi olmayan kullanıcılar da gelsin
            include: [{ model: OrderItem, include: [{model: Product}] }]
          }
        ]
      });
  
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      res.json(user);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { name, phone, address } = req.body;
    
    try {
      const user = await User.findByPk(id);
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      await user.update({ name, phone, address });
      res.json({ message: 'User updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error updating user' });
    }
  });


// Sunucuyu başlat
app.listen(5000, () => console.log('Server running on http://localhost:5000'));
