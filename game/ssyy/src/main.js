// main.js
import { createApp } from 'vue'
import App from './App.vue'
import router from './router' // 确认路径正确

const app = createApp(App)
app.use(router) // ⚠️ 这一行不能少
app.mount('#app')