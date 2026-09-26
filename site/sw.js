// Pode Abrir — service worker SEM cache, de propósito.
// Existe só porque o Chrome (Android/computador) pede um pra oferecer "Instalar".
// No ViralFlow o cache offline fez o celular mostrar código velho depois de
// deploy; aqui tudo vem sempre da rede, então o app instalado é sempre o site atual.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* deixa o navegador buscar normalmente */ });
