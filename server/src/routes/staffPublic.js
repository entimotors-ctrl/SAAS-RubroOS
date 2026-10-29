const router=require('express').Router(),rateLimit=require('express-rate-limit'),staff=require('../services/staffService'),db=require('../db'),{signToken}=require('../middleware/auth');
router.use(rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false,message:{error:'Demasiados intentos. Inténtalo más tarde.'}}));
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.post('/invitation',async (req,res)=>res.json(await staff.preview(req.body?.token)));
router.post('/activate',async (req,res)=>{
 const user=await staff.activate(req.body?.token,req.body?.password);
 const token=await signToken({sub:user.id,tenant_id:user.tenant_id,business_type:user.business_type,role:user.role,nombre:user.nombre,email:user.email});
 res.json({token,user,tenant:await db.prepare('SELECT * FROM tenants WHERE id=?').get(user.tenant_id)});
});
module.exports=router;
