// src/app/[slug]/page.tsx
'use client';

import { useEffect, useState, use, useMemo } from 'react';
import { getPageDataBySlug, PageData, LinkData } from "@/lib/pageService";
import Link from 'next/link';
import Image from 'next/image';
import { 
  FaMapMarkerAlt, FaWhatsapp, FaUtensils, FaPlus, FaMinus, 
  FaShoppingCart, FaTrash, FaStoreSlash, FaExclamationTriangle,
  FaMotorcycle, FaWalking, FaCreditCard, FaMoneyBillWave, FaQrcode
} from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';

// --- TIPOS ---
interface ExtendedPageData extends PageData {
  backgroundImage?: string;
  plan?: string;
  isOpen?: boolean;
  whatsapp?: string;
}

type CartItem = LinkData & { quantity: number; };

type OrderMethod = 'delivery' | 'pickup';
type PaymentMethod = 'pix' | 'card' | 'cash';

// --- COMPONENTE SKELETON (CARREGAMENTO) ---
function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-gray-900 px-4 py-10 animate-pulse">
        <div className="w-24 h-24 bg-gray-700 rounded-full mx-auto mb-4"/>
        <div className="h-8 bg-gray-700 w-48 mx-auto mb-2 rounded"/>
        <div className="h-4 bg-gray-700 w-64 mx-auto mb-8 rounded"/>
        <div className="flex gap-2 mb-8 overflow-hidden">
            {[1,2,3,4].map(i => <div key={i} className="h-8 w-20 bg-gray-700 rounded-full shrink-0"/>)}
        </div>
        <div className="space-y-4">
            {[1,2,3].map(i => (
                <div key={i} className="bg-gray-800 h-28 rounded-xl w-full"/>
            ))}
        </div>
    </div>
  );
}

// --- COMPONENTE ERRO 404 (CARDÁPIO NÃO ENCONTRADO) ---
function NotFoundState() {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 text-center font-sans text-gray-800">
            <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-gray-100">
                <div className="bg-orange-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <FaExclamationTriangle className="text-orange-500 text-4xl" />
                </div>
                <h1 className="text-2xl font-bold mb-2">Cardápio Indisponível</h1>
                <p className="text-gray-500 mb-6">O link que você acessou não existe ou o cardápio foi desativado.</p>
                <Link href="/" className="block w-full bg-gray-800 text-white py-3 rounded-xl font-bold hover:bg-black transition">
                    Criar meu Cardápio
                </Link>
            </div>
        </div>
    );
}

// --- PÁGINA PRINCIPAL ---
export default function MenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = use(params);
  
  // Estados de Dados
  const [pageData, setPageData] = useState<ExtendedPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  
  // Estados do Carrinho e Pedido
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  
  // Estados do Formulário de Pedido
  const [orderMethod, setOrderMethod] = useState<OrderMethod>('delivery');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Carregamento Inicial
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getPageDataBySlug(resolvedParams.slug) as ExtendedPageData | null;
        
        if (!data) { 
            setError(true); 
        } else {
            setPageData(data);
            // Aplica tema
            document.documentElement.className = "";
            const theme = data.theme || 'restaurant';
            if (data.backgroundImage) {
                document.documentElement.classList.add('theme-custom-image');
            } else {
                document.documentElement.classList.add(`theme-${theme}`);
            }
        }
      } catch (err) {
        console.error("Erro ao carregar:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [resolvedParams.slug]);

  // Filtros e Cálculos
  const categories = useMemo(() => {
    if (!pageData?.links) return ['Todos'];
    const cats = Array.from(new Set(pageData.links.map(l => l.category || 'Outros')));
    return ['Todos', ...cats.sort()];
  }, [pageData]);

  const filteredItems = useMemo(() => {
    if (!pageData?.links) return [];
    if (selectedCategory === 'Todos') return pageData.links;
    return pageData.links.filter(l => (l.category || 'Outros') === selectedCategory);
  }, [pageData, selectedCategory]);

  const cartTotal = cart.reduce((acc, item) => {
    const price = parseFloat(item.price?.replace(',', '.') || '0');
    return acc + (price * item.quantity);
  }, 0);

  // Ações do Carrinho
  const addToCart = (item: LinkData) => {
    if (pageData?.isOpen === false) { alert("O estabelecimento está fechado no momento."); return; }
    setCart(prev => {
      const existing = prev.find(i => i.title === item.title);
      if (existing) return prev.map(i => i.title === item.title ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (title: string) => setCart(prev => prev.filter(i => i.title !== title));
  
  const updateQuantity = (title: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.title === title) return { ...i, quantity: Math.max(1, i.quantity + delta) };
      return i;
    }));
  };

  // Enviar Pedido (A MÁGICA DA AUTOMAÇÃO)
  const handleCheckout = () => {
    if (pageData?.isOpen === false) return;
    if (!customerName.trim()) { alert("Por favor, digite seu nome."); return; }
    if (orderMethod === 'delivery' && !customerAddress.trim()) { alert("Por favor, digite o endereço de entrega."); return; }

    let phone = pageData?.whatsapp || '5579996337995'; 
    phone = phone.replace(/\D/g, ''); 

    // Constrói a mensagem formatada
    let message = `*NOVO PEDIDO 📋*\n`;
    message += `------------------------------\n`;
    message += `👤 *Cliente:* ${customerName}\n`;
    message += `📦 *Tipo:* ${orderMethod === 'delivery' ? 'Entrega 🛵' : 'Retirada 🥡'}\n`;
    if (orderMethod === 'delivery') message += `📍 *Endereço:* ${customerAddress}\n`;
    message += `💰 *Pagamento:* ${paymentMethod === 'pix' ? 'Pix' : paymentMethod === 'card' ? 'Cartão' : 'Dinheiro'}\n`;
    message += `------------------------------\n\n`;
    message += `*ITENS DO PEDIDO:*\n`;
    
    cart.forEach(item => { 
        message += `▪️ ${item.quantity}x ${item.title}\n`; 
    });
    
    message += `\n*TOTAL: R$ ${cartTotal.toFixed(2).replace('.', ',')}*`;
    message += `\n\n_Enviado via CardápioPro_`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleLocation = () => {
      if(pageData?.address) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pageData.address)}`, '_blank');
  };

  // --- RENDERIZAÇÃO ---

  if (loading) return <MenuSkeleton />;
  if (error || !pageData) return <NotFoundState />;

  const isPro = pageData.plan === 'pro';
  const isClosed = pageData.isOpen === false;

  return (
    <div className="min-h-screen font-sans text-theme-text bg-theme-bg pb-32"
         style={pageData.backgroundImage ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.8), rgba(0,0,0,0.9)), url(${pageData.backgroundImage})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' } : {}}
    >
      {/* HEADER */}
      <header className="pt-10 pb-6 px-4 text-center relative">
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 mx-auto bg-gray-800 mb-4 relative">
            {pageData.profileImageUrl ? (
                <Image src={pageData.profileImageUrl} alt="Logo" fill className="object-cover" sizes="96px" priority />
            ) : (
                <div className="flex items-center justify-center h-full text-white/30 text-3xl"><FaUtensils/></div>
            )}
        </div>
        <h1 className="text-2xl font-bold mb-2">{pageData.title}</h1>
        <p className="text-white/70 text-sm max-w-md mx-auto">{pageData.bio}</p>
        
        {isClosed && (
            <div className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1 mt-2 animate-pulse">
                <FaStoreSlash/> FECHADO AGORA
            </div>
        )}

        {isPro && pageData.address && (
            <div className="flex justify-center mt-4">
                <button onClick={handleLocation} className="bg-white/10 backdrop-blur border border-white/20 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 hover:bg-white/20 transition">
                    <FaMapMarkerAlt /> Como Chegar
                </button>
            </div>
        )}
      </header>

      {/* CATEGORIAS */}
      <div className="sticky top-0 z-20 bg-theme-bg/95 backdrop-blur py-4 border-b border-white/10">
        <div className="flex overflow-x-auto px-4 gap-2 no-scrollbar">
            {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${selectedCategory === cat ? 'bg-orange-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                    {cat}
                </button>
            ))}
        </div>
      </div>

      {/* LISTA DE ITENS */}
      <main className="container mx-auto max-w-2xl px-4 mt-6 space-y-4">
        {filteredItems.map((item, index) => (
            <motion.div key={index} initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className={`bg-white/5 border border-white/10 rounded-xl p-3 flex gap-4 ${isClosed ? 'opacity-50 grayscale' : ''}`}>
                {item.imageUrl && (
                    <div className="w-24 h-24 rounded-lg bg-gray-800 relative overflow-hidden shrink-0">
                        <Image src={item.imageUrl} alt={item.title} fill className="object-cover" sizes="96px" />
                    </div>
                )}
                <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-start">
                        <h3 className="font-bold text-white">{item.title}</h3>
                        {item.price && <span className="text-orange-400 font-bold text-sm">R$ {item.price}</span>}
                    </div>
                    <p className="text-xs text-white/60 line-clamp-2 mt-1 mb-2">{item.description}</p>
                    <div className="mt-auto flex justify-end">
                        <button onClick={() => addToCart(item)} disabled={isClosed} className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 transition ${isClosed ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-white/10 text-white hover:bg-orange-500'}`}>
                            {isClosed ? 'Fechado' : <>Adicionar <FaPlus size={8}/></>}
                        </button>
                    </div>
                </div>
            </motion.div>
        ))}
        {filteredItems.length === 0 && <p className="text-center text-white/50 py-10">Nenhum item nesta categoria.</p>}
      </main>

      {/* BOTÃO FLUTUANTE */}
      <AnimatePresence>
        {cart.length > 0 && (
            <motion.div initial={{y: 100}} animate={{y: 0}} exit={{y: 100}} className="fixed bottom-4 left-4 right-4 max-w-2xl mx-auto z-30">
                <button onClick={() => setIsCartOpen(true)} className="w-full bg-green-600 text-white p-4 rounded-xl shadow-2xl flex justify-between items-center font-bold">
                    <div className="flex items-center gap-2"><div className="bg-black/20 w-8 h-8 rounded-full flex items-center justify-center text-sm">{cart.reduce((a,b)=>a+b.quantity,0)}</div><span>Ver Carrinho</span></div>
                    <span>R$ {cartTotal.toFixed(2).replace('.', ',')}</span>
                </button>
            </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL CARRINHO / CHECKOUT */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{y: 100}} animate={{y: 0}} className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 text-gray-900 max-h-[90vh] overflow-y-auto flex flex-col shadow-2xl">
                <div className="flex justify-between items-center mb-6 border-b pb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2"><FaShoppingCart/> Seu Pedido</h2>
                    <button onClick={() => setIsCartOpen(false)} className="text-gray-400 hover:text-gray-600 font-bold">Fechar</button>
                </div>
                
                {/* Itens do Carrinho */}
                <div className="flex-1 space-y-4 mb-6">
                    {cart.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center border-b border-gray-100 pb-2 last:border-0">
                            <div><p className="font-bold text-sm">{item.title}</p><p className="text-orange-600 text-xs font-bold">R$ {item.price}</p></div>
                            <div className="flex items-center gap-3 bg-gray-100 rounded-lg p-1">
                                <button onClick={() => updateQuantity(item.title, -1)} className="p-1 hover:bg-white rounded"><FaMinus size={10}/></button>
                                <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.title, 1)} className="p-1 hover:bg-white rounded"><FaPlus size={10}/></button>
                            </div>
                            <button onClick={() => removeFromCart(item.title)} className="text-red-400 hover:text-red-600 p-2"><FaTrash size={12}/></button>
                        </div>
                    ))}
                </div>

                {/* FORMULÁRIO DE CHECKOUT (AUTOMAÇÃO DE DADOS) */}
                <div className="bg-gray-50 p-4 rounded-xl space-y-3 mb-4 border border-gray-200">
                    <h3 className="font-bold text-sm text-gray-700">Detalhes da Entrega</h3>
                    
                    <input 
                        type="text" 
                        placeholder="Seu Nome" 
                        value={customerName} 
                        onChange={e => setCustomerName(e.target.value)}
                        className="w-full border p-2 rounded text-sm outline-none focus:border-green-500"
                    />

                    <div className="flex gap-2">
                        <button onClick={() => setOrderMethod('delivery')} className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-1 border ${orderMethod === 'delivery' ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-gray-300 text-gray-500'}`}>
                            <FaMotorcycle/> Entrega
                        </button>
                        <button onClick={() => setOrderMethod('pickup')} className={`flex-1 py-2 rounded text-xs font-bold flex items-center justify-center gap-1 border ${orderMethod === 'pickup' ? 'bg-orange-100 border-orange-500 text-orange-700' : 'bg-white border-gray-300 text-gray-500'}`}>
                            <FaWalking/> Retirada
                        </button>
                    </div>

                    {orderMethod === 'delivery' && (
                        <textarea 
                            placeholder="Endereço completo (Rua, Número, Bairro...)" 
                            value={customerAddress}
                            onChange={e => setCustomerAddress(e.target.value)}
                            className="w-full border p-2 rounded text-sm outline-none focus:border-green-500 h-16 resize-none animate-in fade-in slide-in-from-top-1"
                        />
                    )}

                    <div className="flex gap-2 pt-2">
                        {[
                            { id: 'pix', label: 'Pix', icon: FaQrcode },
                            { id: 'card', label: 'Cartão', icon: FaCreditCard },
                            { id: 'cash', label: 'Dinheiro', icon: FaMoneyBillWave }
                        ].map(pm => (
                            <button 
                                key={pm.id} 
                                onClick={() => setPaymentMethod(pm.id as PaymentMethod)} 
                                className={`flex-1 py-2 rounded text-[10px] sm:text-xs font-bold flex flex-col items-center gap-1 border transition ${paymentMethod === pm.id ? 'bg-green-100 border-green-500 text-green-700' : 'bg-white border-gray-300 text-gray-500'}`}
                            >
                                <pm.icon size={14} /> {pm.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="border-t pt-4">
                    <div className="flex justify-between text-lg font-bold mb-4"><span>Total</span><span>R$ {cartTotal.toFixed(2).replace('.', ',')}</span></div>
                    {isClosed ? (
                        <div className="w-full bg-red-100 text-red-600 py-3 rounded-xl font-bold text-center border border-red-200">LOJA FECHADA</div>
                    ) : (
                        <button onClick={handleCheckout} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 flex justify-center items-center gap-2 transform active:scale-95 transition">
                            <FaWhatsapp size={20}/> Enviar Pedido no Zap
                        </button>
                    )}
                </div>
            </motion.div>
        </div>
      )}
    </div>
  );
}