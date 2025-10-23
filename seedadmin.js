import mongoose from "mongoose";

await mongoose.connect("mongodb+srv://db_saborly:Dwdjd12KKC0F1ojJ@cluster0.u1qulrp.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0");

const FoodItem = mongoose.connection.collection("banners");

await FoodItem.updateMany(
  { imageUrl: { $regex: "aglhrjakaivffstf\\.public\\.blob\\.vercel-storage\\.com" } },
  [
    {
      $set: {
        imageUrl: {
          $replaceOne: {
            input: "$imageUrl",
            find: "aglhrjakaivffstf.public.blob.vercel-storage.com",
            replacement: "isjqrgksamsoj2tf.public.blob.vercel-storage.com"
           
          }
        }
      }
    }
  ]
);

console.log("✅ All image URLs updated successfully");
process.exit();
