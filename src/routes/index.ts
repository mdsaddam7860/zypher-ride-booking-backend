// import { Router } from "express";
// import authRoutes from "./auth.routes";
// import fareRoutes from "./fare.routes";
// import rideRoutes from "./ride.routes";
// import driverRoutes from "./driver.routes";
// import ownerRoutes from "./owner.routes";

// const router = Router();

// router.use("/auth", authRoutes);
// router.use("/fares", fareRoutes);
// router.use("/rides", rideRoutes);
// router.use("/drivers", driverRoutes);
// router.use("/owner", ownerRoutes);

// export default router;
import { Router } from "express";
import authRoutes from "./auth.routes";
import fareRoutes from "./fare.routes";
import rideRoutes from "./ride.routes";
import driverRoutes from "./driver.routes";
import riderRoutes from "./rider.routes";
import ownerRoutes from "./owner.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/fares", fareRoutes);
router.use("/rides", rideRoutes);
router.use("/drivers", driverRoutes);
router.use("/riders", riderRoutes);
router.use("/owner", ownerRoutes);

export default router;