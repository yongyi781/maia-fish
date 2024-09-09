import App from "./App.svelte"

// const app = mount(App, { target: document.getElementById("app") })
// export default app

const app = new App({ target: document.getElementById("app") })
export default app
