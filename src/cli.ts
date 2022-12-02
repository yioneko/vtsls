#!/usr/bin/env node

import { startServer } from "./main";

startServer().catch((e) => console.error(e));
