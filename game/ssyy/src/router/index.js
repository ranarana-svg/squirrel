// import { createRouter, createWebHistory } from 'vue-router'

// const router = createRouter({
//   history: createWebHistory(import.meta.env.BASE_URL),
//   routes: [],
// })

// export default router
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // 修正语法：使用箭头函数 () => import('...')，并使用英文标点
    { path: '/pit', component: () => import('../views/pit.vue') },
    { path: '/', component: () => import('../views/Level1Brushing.vue') },
    // { path: '/:path(.*)', component: () => import('../views/404.vue') },
    // { path: '/goods', component: () => import('../views/goods.vue') },
    // { path: '/news', component: () => import('../views/news.vue') },
    // { path: '/orders', component: () => import('../views/orders.vue') }
  ],
})

export default router