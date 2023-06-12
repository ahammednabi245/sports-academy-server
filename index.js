const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');

require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware
app.use(cors());
app.use(express.json());




const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Your access unauthorized ' });
  }
  // bearer token
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'Your access unauthorized' })
    }
    req.decoded = decoded;
    next();
  })
}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6rgz80t.mongodb.net/?retryWrites=true&w=majority`;



// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();


    const usersCollection = client.db("sportsDB").collection("users");
    const classCollection = client.db("sportsDB").collection("classes");
    const popularInstructorCollection = client.db("sportsDB").collection("instructors");
    const courseCollection = client.db("sportsDB").collection("selectedCourse");
    const enrolledCollection = client.db("sportsDB").collection("enrolled");



    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })

      res.send({ token })
    })

    // Verify Admin

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden message' });
      }
      next();
    }


    // User API

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);
      console.log('existing user', existingUser);
      if (existingUser) {
        return res.send({ message: 'user already exists' })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get('/instructor',   async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });




    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })


    app.get('/users/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === 'admin' }
      res.send(result);
    })



    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })


    app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ instructor: false })
      }

      const query = { email: email }
      const user = await usersCollection.findOne(query);
      const result = { instructor: user?.role === 'instructor' }
      res.send(result);
    })


    // Classes API


    app.get('/classes', async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });


    app.get('/classes/:id', async (req, res) => {
      const result = await classCollection.findOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    });



    app.get('/classes', async (req, res) => {
      const result = await classCollection.find().sort({ numberOfStudents: -1 }).toArray();
      res.send(result);
    });


    // Popular Instructors

    app.get('/popularInstructors', async (req, res) => {
      const result = await popularInstructorCollection.find().toArray();
      res.send(result);
    });


    app.get('/popularInstructors', async (req, res) => {
      const result = await popularInstructorCollection.find().sort({ numberOfStudents: -1 }).toArray();
      res.send(result);
    });


    // Selected Course 

    app.post('/selectedCourse', async (req, res) => {
      const classes = req.body;
      console.log(classes);
      const result = await courseCollection.insertOne(classes);
      res.send(result);
    });



    app.get('/selectedCourse', verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' })
      }

      const query = { email: email };
      const result = await courseCollection.find(query).toArray();
      res.send(result);
    });


    app.delete('/selectedCourse/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await courseCollection.deleteOne(query);
      res.send(result);
    })


    app.get('/selectedCourse/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await courseCollection.findOne(query)
      res.send(result)
    })


    //  Payment Intent

    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    // payment related api
    app.post('/enrolled/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;

      const insertResult = await enrolledCollection.insertOne(payment);

      const courseId = payment._id;
      const deleteResult = await courseCollection.deleteOne({ _id: new ObjectId(courseId) });

      const updateResult = await classCollection.updateOne(
        { _id: new ObjectId(id) },
        { $inc: { availableSeats: -1 } }
      );

      res.send({ insertResult, deleteResult, updateResult });
    });



    // Enrolled related


    app.get('/enrolled', verifyJWT, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: 'Forbidden access' });
      }

      const query = { email: email };
      const result = await enrolledCollection.find(query).sort({ date: -1 }).toArray();
      res.send(result);
    });


    // Instructor page

    app.post("/classes", async (req, res) => {
      const body = req.body;
      body.createdAt = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      body.price = parseFloat(body.price);
      body.availableSeats = parseFloat(body.availableSeats);
      body.status = "pending";
      const result = await classCollection.insertOne(body);
      if (result?.insertedId) {
        return res.status(200).send(result);
      } else {
        return res.status(404).send({
          message: "can not insert try again later",
          status: false,
        });
      }
    });



    app.get("/myClass/:email", async (req, res) => {
      console.log(req.params.email);
      const myClass = await classCollection
        .find({
          instructorEmail: req.params.email,
        })
        .toArray();
      res.send(myClass);
    });

    app.put('/updateClass/:id', async (req, res) => {
      const id = req.params.id;
      const body = req.body;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: body.name,
          classPicture: body.classPicture,
          instructorName: body.instructorName,
          instructorEmail: body.instructorEmail,
          price: body.price,
          availableSeats: body.availableSeats,
          status: body.status,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.put('/updateMyClass/:id', async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      body.price = parseFloat(body.price);
      body.availableSeats = parseFloat(body.availableSeats);
      body.status = "pending";
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: body.name,
          classPicture: body.classPicture,
          instructorName: body.instructorName,
          instructorEmail: body.instructorEmail,
          price: body.price,
          availableSeats: body.availableSeats,
          status: body.status,
        },
      };
      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Admin Feedback

    app.post('/sendFeedback/:id', async (req, res) => {
      const id = req.params.id;
      const feedback = req.body.feedback;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: feedback,
        },
      };

      const result = await classCollection.updateOne(filter, updateDoc);
      res.send(result);
    });





    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





app.get('/', (req, res) => {
  res.send('Sports Academies Is Now Open');
});

app.listen(port, () => {
  console.log(`Sports Academies server is running on port: ${port}`);
});