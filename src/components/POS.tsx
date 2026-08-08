import { useState, useEffect, useContext, type FormEvent, type CSSProperties } from 'react';
import { format } from 'date-fns';
import { safeFormatDate } from '../utils/format';
import { ShoppingCart, Check, Trash2, Plus, Minus, Settings, Image as ImageIcon, Pencil, Tag, Search, X, ChevronUp, ChevronDown, Printer, CheckCircle, Lock, MessageCircle, Phone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import Receipt from './Receipt';
import type { Product, ProductCategory, ExtraItem } from '../types';
import { getProducts, addProduct, deleteProduct, addTransaction, updateProduct, getCategories, deductInventory, getInventory, getAddOns, saveAddOns, checkIsActiveSubscription, getUser } from '../utils/storage';
import { generateDynamicQRIS } from '../utils/qris';
import { useToast } from './Toast';
import { formatCurrencyInput } from '../utils/currencyInput';
import { AuthContext } from '../App';
import { supabase } from '../lib/supabase';
import Cropper from 'react-easy-crop';
import getCroppedImg, { compressImage } from '../utils/cropImage';

interface AddOn {
  id: string;
  name: string;
  price: number;
}

interface CartItem {
  cartKey: string;
  product: Product;
  quantity: number;
  addOns: AddOn[];
  extras: ExtraItem[];
  note?: string;
  customUnitPrice?: number;
}


type CategoryFilter = 'all' | string;

const POS = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isMenuModalOpen, setIsMenuModalOpen] = useState(false);
  const [menuTab, setMenuTab] = useState<'menu' | 'addon'>('menu');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<'langsung' | 'po'>('langsung');
  const [poPickupDate, setPoPickupDate] = useState('');
  const [poDpAmount, setPoDpAmount] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [newMenu, setNewMenu] = useState({ name: '', price: '', image: '', category: '', recipes: [] as { inventoryId: string; quantity: number; name?: string; unit?: string }[] });
  const [selectedRecipeInvId, setSelectedRecipeInvId] = useState('');
  const [selectedRecipeQty, setSelectedRecipeQty] = useState('1');
  
  // Crop state
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [paymentMethod, setPaymentMethod] = useState<'Tunai' | 'QRIS' | 'DANA' | 'GoPay' | 'Non-Tunai'>('Tunai');
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionReason, setActionReason] = useState({ name: '', reason: '' });
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showQRISModal, setShowQRISModal] = useState(false);
  const [dynamicQRIS, setDynamicQRIS] = useState('');
  const [qrisString, setQrisString] = useState('');
  const [telegramConfig, setTelegramConfig] = useState({ token: '', chatId: '' });
  const [waGatewayConfig, setWaGatewayConfig] = useState({ token: '', url: '/api/fonnte/send', customTemplate: '', shopName: 'Vrimae' });
  const [isActiveSubscription, setIsActiveSubscription] = useState(true);
  const [memberPurchaseCount, setMemberPurchaseCount] = useState<number | null>(null);
  const [checkingMember, setCheckingMember] = useState(false);
  const [customGrandTotal, setCustomGrandTotal] = useState<string>('');
  const [editingCartItem, setEditingCartItem] = useState<{ cartKey: string, price: string } | null>(null);
  const { showToast } = useToast();
  const { isAdmin } = useContext(AuthContext);

  useEffect(() => {
    if (!customerPhone.trim()) {
      setMemberPurchaseCount(null);
      return;
    }
    const corePhone = customerPhone.replace(/\D/g, '').replace(/^(62|0)/, '');
    if (corePhone.length < 8) {
      setMemberPurchaseCount(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingMember(true);
      try {
        const user = await getUser();
        if (!user) {
          setMemberPurchaseCount(0);
          setCheckingMember(false);
          return;
        }
        const { count, error } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .like('description', `%[WA: ${corePhone}]%`)
          .not('description', 'ilike', '%[PO|pending%');
        
        if (!error) {
          setMemberPurchaseCount(count || 0);
        } else {
          setMemberPurchaseCount(0);
        }
      } catch (e) {
        setMemberPurchaseCount(0);
      } finally {
        setCheckingMember(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [customerPhone]);

  const sendWhatsAppToMember = (tx: any) => {
    if (!tx || !tx.customerPhone) return;
    let phone = tx.customerPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.slice(1);
    } else if (phone.startsWith('8')) {
      phone = '62' + phone;
    }
    
    const formatCurrencyLocal = (num: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num);
    
    let originalCalculatedTotal = 0;
    const itemsText = (tx.items || []).map((item: any) => {
      const baseUnit = item.product.price + (item.addOns || []).reduce((s: number, a: any) => s + a.price, 0) + (item.extras || []).reduce((s: number, e: any) => s + (e.pricePerUnit * e.quantity), 0);
      const unitPrice = item.customUnitPrice !== undefined ? item.customUnitPrice : baseUnit;
      originalCalculatedTotal += (unitPrice * item.quantity);
      return `▪️ ${item.quantity}x ${item.product.name} (${formatCurrencyLocal(item.quantity * unitPrice)})`;
    }).join('\n');
    
    const isPO = tx.poStatus === 'pending';
    const countVal = tx.purchaseCount || 1;
    const countText = isPO ? '' : `*Pembelian ke:* ${countVal} 🎉\n`;
    const rincianText = `*ID Order:* ${tx.transactionId || 'Baru'}\n${countText}${itemsText}`;
    
    const totalVal = tx.poTotalAmount || tx.total;
    const dpVal = tx.poDpAmount !== undefined ? tx.poDpAmount : tx.total;
    const sisaVal = totalVal - dpVal;
    let totalText = `${formatCurrencyLocal(totalVal)} (${tx.paymentMethod})`;
    if (tx.items && tx.items.length > 0 && totalVal !== originalCalculatedTotal) {
      totalText += `\n*(Penyesuaian Harga)*`;
    }
    if (isPO && sisaVal > 0) {
       totalText += `\n*Sudah Dibayar (DP):* ${formatCurrencyLocal(dpVal)}\n*Sisa Pelunasan:* ${formatCurrencyLocal(sisaVal)}`;
    }
    
    const customerNameVal = tx.customerName || 'Member';
    const shopNameVal = waGatewayConfig.shopName || 'Vrimae';

    let message = '';
    if (waGatewayConfig.customTemplate && waGatewayConfig.customTemplate.trim() !== '' && !isPO) {
      message = waGatewayConfig.customTemplate
        .replace(/\{nama\}/gi, customerNameVal)
        .replace(/\{kunjungan\}/gi, countVal.toString())
        .replace(/\{toko\}/gi, shopNameVal)
        .replace(/\{rincian\}/gi, rincianText)
        .replace(/\{total\}/gi, totalText);
    } else {
      if (isPO) {
        const pickupStr = tx.poPickupDate ? safeFormatDate(tx.poPickupDate, 'dd MMM yyyy, HH:mm') : '-';
        message = `Halo Kak *${customerNameVal}*,\nTerima kasih telah melakukan *Pre-Order* di *${shopNameVal}*! 💖✨\n\nBerikut rincian Pre-Order Anda:\n${rincianText}\n\n*Total Tagihan:* ${totalText}\n*Tanggal Pengambilan:* ${pickupStr}\n\nKami akan segera memproses pesanan Anda. Ditunggu kedatangannya! 😊🙏`;
      } else {
        const loyaltyGreeting = countVal > 1
          ? `Terima kasih banyak telah menjadi *Member Setia* kami! 💖✨ Ini adalah *pembelian ke-${countVal}* Anda di *${shopNameVal}*! 🥳🔥`
          : `Selamat datang di *${shopNameVal}*! 💖✨ Terima kasih atas *pembelian perdana (ke-1)* Anda di toko kami! 🥳🔥`;
          
        message = `Halo Kak *${customerNameVal}*,\n${loyaltyGreeting}\n\nBerikut rincian transaksi Anda:\n${rincianText}\n\n*Total Pembayaran:* ${totalText}\n\nKami sangat bangga dan bahagia melayani Anda. Ditunggu kedatangannya kembali ya! 😊🙏`;
      }
    }
    
    if (waGatewayConfig.token) {
      let endpoint = waGatewayConfig.url || '/api/fonnte/send';
      if (endpoint === 'https://api.fonnte.com/send' || endpoint.includes('api.fonnte.com')) {
        endpoint = '/api/fonnte/send';
      }
      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': waGatewayConfig.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target: phone,
          message: message,
          countryCode: '62'
        })
      }).then(res => res.json()).then(data => {
        console.log('WA Gateway response:', data);
        if (data.status === false) {
          throw new Error(data.reason || 'Gagal dari pihak Fonnte');
        }
        showToast('success', 'Struk WA Terkirim!', `Pesan otomatis terkirim ke HP Member (${phone}) di balik layar tanpa membuka tab.`);
      }).catch(err => {
        console.error('WA Gateway error:', err);
        showToast('error', 'WA Gateway Gagal', 'Mencoba membuka WhatsApp di tab browser sebagai cadangan...');
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
      });
    } else {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      window.open(url, '_blank');
      showToast('info', 'Membuka WhatsApp Web', 'Tips: Hubungkan Token Fonnte di menu Setelan agar WA terkirim 100% otomatis TANPA BUKA TAB!');
    }
  };

  // Drag and drop states
  const [draggedProductId, setDraggedProductId] = useState<string | null>(null);
  const [draggedOverTab, setDraggedOverTab] = useState<string | null>(null);
  const [justDragged, setJustDragged] = useState(false);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedProductId(id);
    e.dataTransfer.setData('text/plain', id);
    const product = products.find(p => p.id === id);
    if (product) {
      e.dataTransfer.setData('application/json', JSON.stringify({ type: 'vrimae_product', product }));
    }
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragEnd = () => {
    setDraggedProductId(null);
    setDraggedOverTab(null);
    setJustDragged(true);
    setTimeout(() => setJustDragged(false), 200);
  };

  const handleDragOver = (e: React.DragEvent, cat: string) => {
    if (cat === 'all') return;
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent, cat: string) => {
    if (cat === 'all') return;
    e.preventDefault();
    setDraggedOverTab(cat);
  };

  const handleDragLeave = (_e: React.DragEvent, cat: string) => {
    if (cat === 'all') return;
    if (draggedOverTab === cat) {
      setDraggedOverTab(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, targetCategory: string) => {
    e.preventDefault();
    setDraggedOverTab(null);
    if (targetCategory === 'all') return;

    try {
      const jsonStr = e.dataTransfer.getData('application/json');
      if (jsonStr) {
        const data = JSON.parse(jsonStr);
        if (data && data.type === 'vrimae_product' && data.product) {
          const productPayload = data.product;
          if (draggedProductId !== productPayload.id) {
            const newProductData = {
              name: productPayload.name,
              price: productPayload.price,
              image: productPayload.image || '',
              category: targetCategory as ProductCategory,
            };
            showToast('info', 'Menyalin Menu', 'Sedang menyalin menu dari luar...');
            const result = await addProduct(newProductData, "Admin", "Salin Menu Eksternal");
            if (result?.error) {
              showToast('error', 'Gagal', 'Gagal menyalin menu');
            } else {
              showToast('success', 'Berhasil', `Menu "${productPayload.name}" disalin ke kategori ${targetCategory}`);
              fetchProducts();
            }
            return;
          }
        }
      }
    } catch (err) {
      // Ignore non-JSON payload
    }

    const productId = e.dataTransfer.getData('text/plain') || draggedProductId;
    if (!productId) return;

    const product = products.find(p => p.id === productId);
    if (!product) return;
    if (product.category === targetCategory) return;

    // Optimistic UI update
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, category: targetCategory as ProductCategory } : p));
    const label = targetCategory === 'all' ? 'Semua Menu' : targetCategory;
    showToast('success', 'Kategori Diubah', `"${product.name}" berhasil dipindahkan ke kategori ${label}`);

    await updateProduct(productId, { category: targetCategory as ProductCategory });
  };

  // Add-on list state
  const [addOns, setAddOns] = useState<AddOn[]>([]);
  const [addonForm, setAddonForm] = useState({ name: '', price: '' });
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [deleteAddonId, setDeleteAddonId] = useState<string | null>(null);
  const [deleteMenuConfirm, setDeleteMenuConfirm] = useState<{id: string, name: string} | null>(null);

  // Order modal state
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOn[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<ExtraItem[]>([]);
  const [extraForm, setExtraForm] = useState({ inventoryId: '', quantity: '', price: '' });
  const [addonSelectId, setAddonSelectId] = useState<string>('');
  const [isAddonDropdownOpen, setIsAddonDropdownOpen] = useState(false);
  const [addOnQty, setAddOnQty] = useState<number | string>(1);
  const [productNote, setProductNote] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);

  const fetchProducts = async () => {
    setLoading(true);
    const data = await getProducts();
    setProducts(data);
    setLoading(false);
  };

  const fetchInventoryAndRecipes = async () => {
    const inv = await getInventory();
    setInventory(inv);
  };

  useEffect(() => {
    fetchProducts();
    getAddOns().then(setAddOns);
    getCategories().then(cats => {
      setCategories(cats);
      setNewMenu(prev => ({ ...prev, category: prev.category || cats[0] || '' }));
    });
    fetchInventoryAndRecipes();
    getUser().then((user: any) => {
      if (user?.user_metadata) {
        if (user.user_metadata.qris_string) {
          setQrisString(user.user_metadata.qris_string);
        }
        setTelegramConfig({
          token: user.user_metadata.telegram_bot_token || '',
          chatId: user.user_metadata.telegram_chat_id || ''
        });
        const isSuperAdmin = user.email === 'bimdarmawa2@gmail.com' || user.email === 'vrimae23@gmail.com';
        const defaultWaToken = isSuperAdmin ? 'SbmGAc1TxotP4TGuCGpS' : '';
        setWaGatewayConfig({
          token: user.user_metadata.wa_gateway_token || defaultWaToken,
          url: (user.user_metadata?.wa_gateway_url && !user.user_metadata?.wa_gateway_url.includes('api.fonnte.com')) ? user.user_metadata?.wa_gateway_url : '/api/fonnte/send',
          customTemplate: user.user_metadata.wa_custom_template || '',
          shopName: user.user_metadata.shop_name || 'Vrimae'
        });
      }
    });
    checkIsActiveSubscription().then(setIsActiveSubscription);
  }, []);

  // ── Add-on CRUD ──────────────────────────────────────────────
  const openEditAddon = (addon: AddOn) => {
    setEditingAddonId(addon.id);
    setAddonForm({ name: addon.name, price: addon.price.toString() });
    setActionReason({ name: '', reason: '' });
  };

  const handleSaveAddon = (e: FormEvent) => {
    e.preventDefault();
    if (!addonForm.name || !addonForm.price) return;
    
    let updated: AddOn[];
    if (editingAddonId) {
      updated = addOns.map(a => a.id === editingAddonId ? { ...a, name: addonForm.name, price: parseFloat(addonForm.price) } : a);
      showToast('success', 'Add-on Diperbarui', `"${addonForm.name}" berhasil disimpan`);
      saveAddOns(updated, "Admin", "Update Add-on");
    } else {
      const newAddon: AddOn = { id: `addon-${Date.now()}`, name: addonForm.name, price: parseFloat(addonForm.price) };
      updated = [...addOns, newAddon];
      showToast('success', 'Add-on Ditambahkan', `"${addonForm.name}" tersedia di etalase`);
      saveAddOns(updated, "Admin", "Tambah Add-on");
    }
    setAddOns(updated);
    setEditingAddonId(null);
    setAddonForm({ name: '', price: '' });
  };

  const handleDeleteAddon = (id: string | null) => {
    if (!id || isDeleting) return;
    setIsDeleting(true);
    try {
      const updated = addOns.filter(a => a.id !== id);
      setAddOns(updated);
      saveAddOns(updated, "Admin", "Hapus Add-on");
      setDeleteAddonId(null);
      showToast('success', 'Add-on Dihapus', 'Data telah dihapus');
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Order flow ──────────────────────────────────────────────
  const openAddOnModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedAddOns([]);
    setSelectedExtras([]);
    setExtraForm({ inventoryId: '', quantity: '', price: '' });
    setAddOnQty(1);
    setProductNote('');
  };

  const handleAddAddon = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    if (!addonSelectId) return;
    const addon = addOns.find(a => a.id === addonSelectId);
    if (!addon) return;
    
    setSelectedAddOns(prev => {
      if (prev.find(a => a.id === addon.id)) return prev;
      return [...prev, addon];
    });
    setAddonSelectId('');
  };

  const handleAddExtra = (e: FormEvent) => {
    e.preventDefault();
    if (!extraForm.inventoryId || !extraForm.quantity) return;
    const invItem = inventory.find(i => i.id === extraForm.inventoryId);
    if (!invItem) return;
    const qty = parseFloat(extraForm.quantity);
    if (qty <= 0) return;
    
    const customPrice = extraForm.price !== '' ? parseFloat(extraForm.price) : invItem.unitPrice;

    const newExtra: ExtraItem = {
      inventoryId: invItem.id,
      name: invItem.name,
      unit: invItem.unit || '',
      quantity: qty,
      pricePerUnit: isNaN(customPrice) ? 0 : customPrice
    };

    setSelectedExtras(prev => {
      const existing = prev.find(p => p.inventoryId === newExtra.inventoryId);
      if (existing) {
        return prev.map(p => p.inventoryId === newExtra.inventoryId ? { ...p, quantity: p.quantity + qty, pricePerUnit: newExtra.pricePerUnit } : p);
      }
      return [...prev, newExtra];
    });
    setExtraForm({ inventoryId: '', quantity: '', price: '' });
  };

  const handleRemoveExtra = (invId: string) => {
    setSelectedExtras(prev => prev.filter(e => e.inventoryId !== invId));
  };

  const confirmAddToCart = () => {
    if (!selectedProduct) return;
    const finalQty = Number(addOnQty) || 1;
    const cartKey = `${selectedProduct.id}_${selectedAddOns.map(a => a.id).join('_')}_${selectedExtras.map(e => `${e.inventoryId}-${e.quantity}`).join('_')}_${productNote}_${Date.now()}`;
    setCart(prev => [...prev, { cartKey, product: selectedProduct, quantity: finalQty, addOns: selectedAddOns, extras: selectedExtras, note: productNote }]);
    setSelectedProduct(null);
    setProductNote('');
    showToast('success', 'Ditambahkan!', `${selectedProduct.name} telah ditambahkan ke keranjang`);
  };

  const getBaseUnitPrice = (item: CartItem) => {
    const addOnTotal = item.addOns.reduce((s, a) => s + a.price, 0);
    const extrasTotal = item.extras.reduce((s, e) => s + (e.pricePerUnit * e.quantity), 0);
    return item.product.price + addOnTotal + extrasTotal;
  };

  const itemTotalPrice = (item: CartItem) => {
    if (item.customUnitPrice !== undefined) return item.customUnitPrice * item.quantity;
    return getBaseUnitPrice(item) * item.quantity;
  };

  const updateQuantity = (cartKey: string, delta: number) => {
    setCart(prev =>
      prev.map(item => item.cartKey === cartKey ? { ...item, quantity: item.quantity + delta } : item)
        .filter(item => item.quantity > 0)
    );
  };

  const removeFromCart = (cartKey: string) => {
    setCart(prev => prev.filter(item => item.cartKey !== cartKey));
  };

  const calculateOriginalTotal = () => cart.reduce((sum, item) => sum + itemTotalPrice(item), 0);
  
  const calculateTotal = () => {
    if (customGrandTotal.trim() !== '') {
      const parsed = Number(customGrandTotal.replace(/\D/g, ''));
      if (!isNaN(parsed)) return parsed;
    }
    return calculateOriginalTotal();
  };

  const processTransaction = async () => {
    setIsSubmitting(true);
    try {
      const totalAmount = calculateTotal();
      const description = cart.map(item => {
        const addOnStr = item.addOns.length ? " (+" + item.addOns.map(a => a.name).join(', ') + ")" : "";
        const extraStr = item.extras && item.extras.length ? " (✦" + item.extras.map(e => `${e.name} ${e.quantity}${e.unit}`).join(', ') + ")" : "";
        const noteStr = item.note ? ` [Catatan: ${item.note}]` : "";
        return item.product.name + addOnStr + extraStr + noteStr + " (" + item.quantity + "x)";
      }).join(', ');
      
      const cleanPhone = customerPhone.trim().replace(/\D/g, '');
      const corePhone = cleanPhone.replace(/^(62|0)/, '');
      const phoneTag = corePhone ? ` [WA: ${corePhone}]` : '';
      const baseDesc = customerName.trim() 
        ? `Pesanan: ${customerName.trim()} - ${description}` 
        : `Pesanan: Umum - ${description}`;
      const finalDescription = `[${paymentMethod}] ${baseDesc}${phoneTag}`;
      
      const currentPurchaseCount = (memberPurchaseCount !== null && corePhone.length >= 8) 
        ? (orderType === 'po' ? memberPurchaseCount : (memberPurchaseCount + 1)) 
        : (orderType === 'po' ? 0 : 1);

      const finalDpAmount = orderType === 'po' && poDpAmount ? Number(poDpAmount.replace(/\D/g, '')) : totalAmount;

      const txResult = await addTransaction({
        type: 'income' as const,
        amount: orderType === 'po' ? finalDpAmount : totalAmount,
        category: 'Penjualan',
        description: finalDescription,
        date: format(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
        poStatus: orderType === 'po' ? 'pending' : undefined,
        poPickupDate: orderType === 'po' ? poPickupDate : undefined,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        poTotalAmount: orderType === 'po' ? totalAmount : undefined,
        poDpAmount: orderType === 'po' ? finalDpAmount : undefined
      });
      
      const txId = txResult?.[0]?.id || `TRX-${Date.now()}`;
      
      const finishedTx = {
        items: [...cart],
        total: totalAmount,
        paymentMethod,
        customerName: customerName.trim() || 'Umum',
        customerPhone: customerPhone.trim(),
        date: new Date(),
        transactionId: txId,
        purchaseCount: currentPurchaseCount,
        poStatus: orderType === 'po' ? 'pending' : undefined,
        poPickupDate: orderType === 'po' ? poPickupDate : undefined,
        poTotalAmount: orderType === 'po' ? totalAmount : undefined,
        poDpAmount: orderType === 'po' ? finalDpAmount : undefined
      };
      setLastTransaction(finishedTx);
      
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setOrderType('langsung');
      setPoPickupDate('');
      setPoDpAmount('');
      setCustomGrandTotal('');
      setMemberPurchaseCount(null);
      setShowQRISModal(false);
      setShowSuccessModal(true);
      showToast('success', 'Penjualan Berhasil!', `Total: ${formatCurrency(totalAmount)}`);

      // ⚡ ASYNC BACKGROUND EXECUTION (Non-Blocking Response to User)
      // Pemotongan stok bahan/resep, update riwayat, & notifikasi dikerjakan secara asynchronous di background
      setTimeout(() => {
        deductInventory(finishedTx.items).then(() => {
          fetchInventoryAndRecipes();
        }).catch(err => console.error('Async inventory check error:', err));
      }, 50);

      if (finishedTx.customerPhone) {
        setTimeout(() => {
          sendWhatsAppToMember(finishedTx);
        }, 300);
      }

      // Telegram Notification
      if (telegramConfig.token && telegramConfig.chatId) {
        try {
          const itemList = cart.map(item => `- ${item.quantity}x ${item.product.name} (Rp ${(item.customUnitPrice !== undefined ? item.customUnitPrice : item.product.price).toLocaleString('id-ID')})${item.note ? `\n  Catatan: ${item.note}` : ''}`).join('\n');
          const message = `🔔 *Transaksi Baru (Vrimae)*\n\n*ID:* ${txId}\n*Total:* Rp ${totalAmount.toLocaleString('id-ID')}\n*Metode:* ${paymentMethod}\n*Pelanggan:* ${customerName.trim() || 'Umum'}\n\n*Pesanan:*\n${itemList}`;
          
          fetch(`https://api.telegram.org/bot${telegramConfig.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: telegramConfig.chatId,
              text: message,
              parse_mode: 'Markdown'
            })
          }).catch(err => console.error('Telegram error:', err));
        } catch (e) {
          console.error(e);
        }
      }
    } catch (error: any) {
      console.error(error);
      showToast('error', 'Gagal', error.message || 'Terjadi kesalahan saat memproses transaksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {

    // Validate inventory stock first
    const inventoryUsage: Record<string, number> = {};
    for (const item of cart) {
      if (item.extras && Array.isArray(item.extras)) {
        for (const extra of item.extras) {
          inventoryUsage[extra.inventoryId] = (inventoryUsage[extra.inventoryId] || 0) + (extra.quantity * item.quantity);
        }
      }
    }

    const insufficientItems = [];
    for (const invId of Object.keys(inventoryUsage)) {
      const needed = inventoryUsage[invId];
      const invItem = inventory.find(i => i.id === invId);
      if (!invItem || invItem.quantity < needed) {
        insufficientItems.push(`${invItem?.name || 'Barang Tidak Ditemukan'} (Butuh: ${needed} ${invItem?.unit || ''}, Stok: ${invItem?.quantity || 0} ${invItem?.unit || ''})`);
      }
    }

    if (insufficientItems.length > 0) {
      showToast('error', 'Stok Tidak Mencukupi', `Gagal diproses. Bahan kurang: ${insufficientItems.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    const totalAmount = calculateTotal();
    
    // QRIS Flow
    if (['QRIS', 'DANA', 'GoPay'].includes(paymentMethod)) {
      if (!qrisString) {
        showToast('error', 'QRIS Belum Diatur', 'Silakan masukkan Teks Kode QRIS di halaman Pengaturan terlebih dahulu.');
        setIsSubmitting(false);
        return;
      }
      const dynQris = generateDynamicQRIS(qrisString, totalAmount);
      setDynamicQRIS(dynQris);
      setShowQRISModal(true);
      setIsSubmitting(false);
      return; // Stop here, wait for manual confirmation
    }

    // Cash flow (or missing QRIS string)
    await processTransaction();

    } catch (error: any) {
      console.error(error);
      showToast('error', 'Gagal', error.message || 'Terjadi kesalahan saat memproses transaksi.');
      setIsSubmitting(false);
    }
  };

  const handleAddMenu = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMenu.name || !newMenu.price || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const menuName = newMenu.name;
      const price = parseFloat(newMenu.price);
      const category = newMenu.category;
      const image = newMenu.image || '/default-item.svg';
      const recipes = newMenu.recipes || [];

      if (editingMenuId) {
        try {
          await updateProduct(editingMenuId, { name: menuName, price, image, category, recipes }, "Admin", "Update Menu");
          showToast('success', 'Menu Diperbarui', `"${menuName}" berhasil diperbarui`);
          setEditingMenuId(null);
        } catch (error: any) {
          showToast('error', 'Gagal Memperbarui Menu', error.message || String(error));
          return;
        }
      } else {
        const result = await addProduct({ name: menuName, price, image, category, recipes }, "Admin", "Tambah Menu");
        if (result?.error) {
          showToast('error', 'Gagal Menambahkan Menu', String(result.error?.message || result.error));
          return;
        }
        showToast('success', 'Menu Ditambahkan', `"${menuName}" berhasil masuk etalase`);
      }
      
      setNewMenu({ name: '', price: '', image: '', category: categories[0] || '', recipes: [] });
      setSelectedRecipeInvId('');
      setSelectedRecipeQty('1');
      setIsMenuModalOpen(false);
      await fetchProducts();
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkValidImage = (file: File): boolean => {
    if (file.size > 30 * 1024 * 1024) {
      showToast('error', 'Gagal', 'Ukuran gambar maksimal 30MB');
      return false;
    }
    const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type.includes('heic') || file.type.includes('heif');
    if (isHeic) {
      showToast('error', 'Format Foto iPhone (HEIC) Tidak Didukung', 'Browser Windows tidak dapat membuka foto iPhone format .HEIC/.HEIF. Silakan ubah foto ke JPG/PNG, atau ambil screenshot dari foto tersebut lalu upload.');
      return false;
    }
    return true;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!checkValidImage(file)) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      e.target.value = '';
    };
    reader.onerror = () => {
      showToast('error', 'Gagal Membaca File', 'File gambar tidak dapat dibaca dari sistem Anda.');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDirectImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!checkValidImage(file)) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const rawUrl = reader.result as string;
      showToast('info', 'Memproses Foto...', 'Sedang mengkompresi foto agar cepat tersimpan...');
      const compressed = await compressImage(rawUrl, 450, 0.75);
      setNewMenu(prev => ({ ...prev, image: compressed }));
      showToast('success', 'Foto Terpasang', 'Foto berhasil dipasang langsung tanpa crop.');
      e.target.value = '';
    };
    reader.onerror = () => {
      showToast('error', 'Gagal Membaca File', 'File gambar tidak dapat dibaca.');
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteMenu = async (id: string, name: string) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteProduct(id, "Admin", "Hapus Menu");
      setCart(prev => prev.filter(item => item.product.id !== id));
      fetchProducts();
      setDeleteMenuConfirm(null);
      showToast('success', 'Menu Dihapus', `"${name}" telah dihapus`);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return 'Rp ' + amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  // Tab button style helper
  const tabStyle = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: '0.6rem 1rem',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    fontWeight: 700,
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    background: active ? 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))' : 'transparent',
    color: active ? 'white' : 'var(--color-text-secondary)',
    boxShadow: 'none',
  });

  const filteredProducts = products.filter(p => {
    if (categoryFilter !== 'all') {
      if (categoryFilter === 'other') {
        if (p.category && categories.includes(p.category)) return false;
      } else {
        if (p.category !== categoryFilter) return false;
      }
    }
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="pos-page-container">
      <div className="page-header" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Kasir (POS)</h1>
          <p className="page-subtitle">Klik produk untuk menambahkan ke keranjang</p>
        </div>
        {isAdmin && (
          <button className="btn btn-outline" onClick={() => { setIsMenuModalOpen(true); setMenuTab('menu'); }}>
            <Settings size={14} /> Manajemen Menu
          </button>
        )}
      </div>

      {!isActiveSubscription && (
        <div style={{ background: 'var(--color-expense-bg)', color: 'var(--color-expense)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-expense)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Lock size={20} />
          <div>
            <div style={{ fontWeight: 700 }}>Trial atau Masa Aktif Anda Telah Berakhir</div>
            <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Kasir dalam mode hanya-lihat. Anda tidak dapat memproses penjualan atau menambah menu baru sampai langganan diaktifkan kembali. Data Anda tetap aman.</div>
          </div>
        </div>
      )}

      {/* ── Search & Category Filter Tabs ── */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Search Bar */}
        <div style={{ position: 'relative', flex: '1 1 250px' }}>
          <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-light)' }} />
          <input
            type="text"
            placeholder="Cari produk"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem 1rem 0.75rem 2.8rem',
              borderRadius: '14px',
              border: '1px solid var(--color-border-light)',
              background: 'var(--color-surface)',
              fontSize: '0.9rem',
              color: 'var(--color-text)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              outline: 'none',
              transition: 'border-color 0.2s ease',
            }}
            onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
            onBlur={(e) => e.target.style.borderColor = 'var(--color-border-light)'}
          />
        </div>

        {/* Category Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          padding: '0.4rem',
          background: 'var(--color-surface)',
          borderRadius: '14px',
          border: '1px solid var(--color-border-light)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          flexWrap: 'wrap',
          flex: '2 1 auto',
        }}>
          {['all', ...categories, 'other'].map(cat => {
          const isActive = categoryFilter === cat;
          const isDraggedOver = draggedOverTab === cat;
          let count = 0;
          if (cat === 'all') {
            count = products.length;
          } else if (cat === 'other') {
            count = products.filter(p => !p.category || !categories.includes(p.category)).length;
          } else {
            count = products.filter(p => p.category === cat).length;
          }
          const label = cat === 'all' ? 'Semua Menu' : (cat === 'other' ? 'Lainnya' : cat);
          
          if (cat === 'other' && count === 0) return null; // Don't show Lainnya tab if empty

          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              onDragOver={(e) => handleDragOver(e, cat)}
              onDragEnter={(e) => handleDragEnter(e, cat)}
              onDragLeave={(e) => handleDragLeave(e, cat)}
              onDrop={(e) => handleDrop(e, cat)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.55rem 1.2rem',
                borderRadius: '10px',
                border: isDraggedOver 
                  ? '2px dashed var(--color-primary)' 
                  : (isActive ? 'none' : '1px solid var(--color-border-light)'),
                background: isDraggedOver 
                  ? 'var(--color-primary-lighter)' 
                  : (isActive ? 'var(--color-primary)' : 'var(--color-surface)'),
                color: isDraggedOver
                  ? 'var(--color-primary)'
                  : (isActive ? 'white' : 'var(--color-text-secondary)'),
                fontWeight: isActive || isDraggedOver ? 700 : 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                boxShadow: 'none',
                flex: '0 0 auto',
                transform: isDraggedOver ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {label}
              <span style={{
                background: isActive || isDraggedOver ? 'rgba(255,255,255,0.25)' : 'var(--color-surface-alt)',
                color: isActive || isDraggedOver ? 'white' : 'var(--color-text-secondary)',
                padding: '0.1rem 0.5rem',
                borderRadius: '999px',
                fontSize: '0.7rem',
                fontWeight: 700,
                minWidth: '22px',
                textAlign: 'center',
              }}>{count}</span>
            </button>
          );
        })}
        </div>
      </div>

      <div className="grid pos-layout gap-4 lg:gap-6">
        {/* Product Grid */}
        <div className="product-grid">
          {loading ? (
            <div className="col-span-full"><div className="loading-spinner" /></div>
          ) : filteredProducts.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4rem 2rem',
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-text-secondary)',
              textAlign: 'center',
            }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--color-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.85rem', opacity: 0.5 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.3rem', color: 'var(--color-text)' }}>
                {products.length === 0 ? 'Menu masih kosong' : 'Tidak ada menu di kategori ini'}
              </div>
              <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                {products.length === 0 ? 'Buka Manajemen Menu untuk menambahkan produk.' : 'Coba pilih kategori lain atau tambah menu baru.'}
              </div>
            </div>
          ) : filteredProducts.map(product => {
            const isDragging = draggedProductId === product.id;
            return (
            <div
              key={product.id}
              onClick={(e) => {
                if (justDragged) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                openAddOnModal(product);
              }}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, product.id)}
              onDragEnd={handleDragEnd}
              style={{
                borderRadius: '16px',
                border: '1.5px solid var(--color-border-light)',
                background: 'var(--color-surface)',
                cursor: 'grab',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: isDragging ? 'none' : '0 2px 8px rgba(0,0,0,0.07)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease',
                overflow: 'visible',
                opacity: isDragging ? 0.4 : 1,
                transform: isDragging ? 'scale(0.95)' : undefined,
              }}
              onMouseEnter={e => {
                if (isDragging) return;
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-5px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 16px 36px rgba(0,0,0,0.14)';
              }}
              onMouseLeave={e => {
                if (isDragging) return;
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.07)';
              }}
            >
              {/* ── Foto ── */}
              <div style={{ position: 'relative', width: '100%', height: '200px', flexShrink: 0, overflow: 'hidden', borderRadius: '14px 14px 0 0' }}>
                <img
                  src={product.image || '/default-item.svg'}
                  alt={product.name}
                  loading="lazy"
                  draggable={false}
                  onError={(e) => {
                    if (!e.currentTarget.src.endsWith('/default-item.svg')) {
                      e.currentTarget.src = '/default-item.svg';
                    }
                  }}
                  style={{ width: '100%', height: '200px', objectFit: 'cover', display: 'block' }}
                />
              </div>

              {/* ── Info di bawah foto ── */}
              <div style={{
                padding: '0.75rem 0.85rem 0.8rem',
                background: 'var(--color-surface)',
                borderRadius: '0 0 14px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                textAlign: 'center',
              }}>
                {/* Nama Menu */}
                <div style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: 'var(--color-text)',
                  lineHeight: 1.3,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  minHeight: '1.25rem',
                }}>
                  {product.name || 'Menu Tanpa Nama'}
                </div>
                {/* Harga */}
                <div style={{
                  fontSize: '0.95rem',
                  fontWeight: 800,
                  color: 'var(--color-primary)',
                }}>
                  {formatCurrency(product.price)}
                </div>
                {/* Tombol */}
                <div style={{
                  marginTop: '0.3rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.3rem',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#fff',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
                  borderRadius: '8px',
                  padding: '0.45rem',
                  boxShadow: 'none',
                  whiteSpace: 'nowrap',
                }}>
                  <Plus size={14} /> Tambah
                </div>
              </div>
            </div>
          );
          })}
        </div>

        {/* Cart Panel */}
        <div className="cart-panel flex flex-col" style={{ alignSelf: 'start' }}>
          <div className="flex justify-between items-center mb-4 pb-4 border-b">
            <h2 className="text-lg font-bold flex items-center gap-2"><ShoppingCart size={18} /> Keranjang</h2>
            <span className="badge badge-primary">{cart.reduce((sum, i) => sum + i.quantity, 0)} Item</span>
          </div>
          <div className="flex-1 mb-4" style={{ minHeight: '180px', overflowY: 'auto' }}>
            {cart.length === 0 ? (
              <div className="text-center text-muted" style={{ paddingTop: '2.5rem' }}>
                <ShoppingCart size={36} style={{ opacity: 0.15, margin: '0 auto 0.75rem' }} />
                <p className="text-sm">Keranjang kosong</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {cart.map(item => (
                  <div key={item.cartKey} className="pb-3 border-b">
                    <div className="flex justify-between items-start">
                      <div style={{ flex: 1, minWidth: 0, marginRight: '0.5rem' }}>
                        <div className="font-semibold text-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product.name}</div>
                        {item.addOns.length > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '0.15rem' }}>
                            + {item.addOns.map(a => a.name).join(', ')}
                          </div>
                        )}
                        {item.extras && item.extras.length > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-expense)', fontWeight: 600, marginTop: '0.15rem' }}>
                            ✦ {item.extras.map(e => `${e.name} ${e.quantity}${e.unit}`).join(', ')}
                          </div>
                        )}
                        {item.note && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginTop: '0.15rem' }}>
                            Catatan: {item.note}
                          </div>
                        )}
                        <div className="text-muted text-xs flex items-center gap-2" style={{ marginTop: '0.2rem' }}>
                          {editingCartItem?.cartKey === item.cartKey ? (
                            <input
                              type="text"
                              inputMode="numeric"
                              className="form-input"
                              style={{ width: '80px', padding: '0.2rem 0.4rem', fontSize: '0.75rem', height: 'auto' }}
                              value={editingCartItem.price}
                              onChange={(e) => setEditingCartItem({ ...editingCartItem, price: e.target.value.replace(/\D/g, '') })}
                              onBlur={() => {
                                const newPrice = Number(editingCartItem.price);
                                if (!isNaN(newPrice)) {
                                  setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, customUnitPrice: newPrice } : i));
                                }
                                setEditingCartItem(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newPrice = Number(editingCartItem.price);
                                  if (!isNaN(newPrice)) {
                                    setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, customUnitPrice: newPrice } : i));
                                  }
                                  setEditingCartItem(null);
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span 
                              onClick={() => setEditingCartItem({ cartKey: item.cartKey, price: (item.customUnitPrice !== undefined ? item.customUnitPrice : getBaseUnitPrice(item)).toString() })}
                              style={{ cursor: 'pointer', borderBottom: '1px dashed var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              {formatCurrency(item.customUnitPrice !== undefined ? item.customUnitPrice : getBaseUnitPrice(item))} <Pencil size={10} />
                            </span>
                          )}
                          × {item.quantity} = <span className="font-semibold text-primary">{formatCurrency(itemTotalPrice(item))}</span>
                          {item.customUnitPrice !== undefined && (
                            <button onClick={() => setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, customUnitPrice: undefined } : i))} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-expense)', marginLeft: '4px' }}><X size={12} /></button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                        <button className="btn-icon" onClick={() => updateQuantity(item.cartKey, -1)} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)' }}><Minus size={16} /></button>
                        <input 
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 1) {
                              setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, quantity: val } : i));
                            } else if (e.target.value === '') {
                              setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, quantity: '' as any } : i));
                            }
                          }}
                          onBlur={() => {
                            if (!item.quantity || Number(item.quantity) < 1) {
                              setCart(prev => prev.map(i => i.cartKey === item.cartKey ? { ...i, quantity: 1 } : i));
                            }
                          }}
                          style={{ fontWeight: 'bold', fontSize: '0.875rem', width: '32px', textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--color-text)', outline: 'none', padding: 0 }}
                        />
                        <button className="btn-icon" onClick={() => updateQuantity(item.cartKey, 1)} style={{ minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: 'var(--color-surface-alt)' }}><Plus size={16} /></button>
                        <button className="btn-icon" onClick={() => removeFromCart(item.cartKey)} style={{ color: 'var(--color-expense)', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className={`checkout-footer pt-4 border-t ${isCheckoutOpen ? 'open' : ''}`} style={{ borderTopWidth: 2, borderTopColor: 'var(--color-border)' }}>
            <button className="mobile-checkout-close" onClick={() => setIsCheckoutOpen(false)}>
              <ChevronDown size={24} />
            </button>
            <button 
              className="payment-toggle-btn"
              onClick={() => setShowPaymentOptions(!showPaymentOptions)}
              style={{ justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1rem', color: 'var(--color-text)', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', transition: 'all 0.2s' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Phone size={16} style={{ color: 'var(--color-primary)' }} />
                {showPaymentOptions ? 'Tutup Opsi Member' : (customerPhone ? `Member: ${customerName || customerPhone}` : '👤 Member WhatsApp & Pembayaran')}
              </span>
              {showPaymentOptions ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>

            <div className={`payment-options-container ${showPaymentOptions ? 'show' : ''}`}>
                <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', background: 'rgba(236, 72, 153, 0.04)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(236, 72, 153, 0.15)' }}>
                  
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <button type="button" onClick={() => setOrderType('langsung')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: `1px solid ${orderType === 'langsung' ? 'var(--color-primary)' : 'var(--color-border)'}`, background: orderType === 'langsung' ? 'rgba(236, 72, 153, 0.1)' : 'var(--color-surface)', color: orderType === 'langsung' ? 'var(--color-primary)' : 'var(--color-text)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>Langsung</button>
                    <button type="button" onClick={() => setOrderType('po')} style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: `1px solid ${orderType === 'po' ? 'var(--color-primary)' : 'var(--color-border)'}`, background: orderType === 'po' ? 'rgba(236, 72, 153, 0.1)' : 'var(--color-surface)', color: orderType === 'po' ? 'var(--color-primary)' : 'var(--color-text)', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s' }}>Pre-Order (PO)</button>
                  </div>
                  
                  {orderType === 'po' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.25rem' }}>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Tanggal Pengambilan (PO)</label>
                        <input
                          type="datetime-local"
                          value={poPickupDate}
                          onChange={(e) => setPoPickupDate(e.target.value)}
                          style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '0.85rem', color: 'var(--color-text)', outline: 'none' }}
                          onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                          onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.25rem', display: 'block' }}>Panjar / DP (Kosongkan jika lunas)</label>
                        <input
                          type="text"
                          placeholder={`Maks: Rp ${calculateTotal().toLocaleString('id-ID')}`}
                          value={poDpAmount}
                          onChange={(e) => setPoDpAmount(formatCurrencyInput(e.target.value))}
                          style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', fontSize: '0.85rem', color: 'var(--color-text)', outline: 'none' }}
                          onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                          onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
                    <MessageCircle size={15} color="#22C55E" /> WhatsApp & Member Loyalty
                  </div>
                  <input
                    type="text"
                    placeholder="Nama Member / Pelanggan"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      fontSize: '0.85rem',
                      color: 'var(--color-text)',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                  <input
                    type="tel"
                    placeholder="No. WhatsApp (08xxxxxxxxx)"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      fontSize: '0.85rem',
                      color: 'var(--color-text)',
                      outline: 'none',
                      transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
                    onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                  />
                  {checkingMember && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                      ⏳ Memeriksa riwayat kunjungan member...
                    </div>
                  )}
                  {!checkingMember && memberPurchaseCount !== null && (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      background: memberPurchaseCount > 0 ? 'rgba(59, 130, 246, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                      border: `1px solid ${memberPurchaseCount > 0 ? 'rgba(59, 130, 246, 0.35)' : 'rgba(34, 197, 94, 0.35)'}`,
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: memberPurchaseCount > 0 ? '#3B82F6' : '#16A34A',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}>
                      {memberPurchaseCount > 0 ? (
                        <>🎉 Member Setia! Sudah {memberPurchaseCount}x transaksi (Ini pembelian ke-{memberPurchaseCount + 1})</>
                      ) : (
                        <>✨ Member Baru! (Ini adalah pembelian perdana / ke-1)</>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                    ✨ <em>Saat pesanan selesai, struk digital & ucapan otomatis dikirim via WhatsApp!</em>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {['Tunai', 'QRIS', 'DANA', 'GoPay', 'Lainnya'].map(method => (
                    <button 
                      key={method}
                      className={`btn ${paymentMethod === method ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPaymentMethod(method as any)}
                      style={{ padding: '0.5rem 0.8rem', fontWeight: 600, flexShrink: 0, fontSize: '0.85rem', flexGrow: 1 }}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-secondary">Total</span>
                {customGrandTotal.trim() !== '' && (
                  <button onClick={() => setCustomGrandTotal('')} style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: 'var(--color-expense)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}><X size={12}/> Reset Custom Total</button>
                )}
              </div>
              <div className="flex justify-between items-center p-2 rounded-lg" style={{ background: 'var(--color-surface-alt)', border: '1px solid var(--color-border)' }}>
                <span className="text-sm font-medium text-secondary mr-2">Rp</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={calculateOriginalTotal().toLocaleString('id-ID')}
                  value={customGrandTotal !== '' ? Number(customGrandTotal.replace(/\D/g, '')).toLocaleString('id-ID') : ''}
                  onChange={(e) => setCustomGrandTotal(e.target.value.replace(/\D/g, ''))}
                  className="font-extrabold text-xl text-primary text-right"
                  style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none' }}
                />
              </div>
            </div>
            <button 
              className="btn btn-primary w-full" 
              style={{ padding: '0.85rem', fontSize: '0.95rem', opacity: (cart.length === 0 || isSubmitting || !isActiveSubscription) ? 0.5 : 1 }} 
              onClick={handleCheckout} 
              disabled={cart.length === 0 || isSubmitting || !isActiveSubscription}
            >
              <Check size={18} /> {!isActiveSubscription ? 'Akun Perlu Aktivasi' : (isSubmitting ? 'Memproses...' : 'Konfirmasi Penjualan')}
            </button>
          </div>
        </div>

        {/* Mobile Checkout Toggle Button */}
        <div className={`mobile-checkout-toggle ${isCheckoutOpen ? 'hidden' : ''}`}>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', justifyContent: 'space-between', padding: '1.1rem 1.5rem', borderRadius: '16px', fontSize: '1.05rem', boxShadow: 'var(--shadow-lg)' }} 
            onClick={() => setIsCheckoutOpen(true)}
            disabled={cart.length === 0}
          >
            <span style={{ fontWeight: 800, fontSize: '1.1rem' }}>Total: {formatCurrency(calculateTotal())}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
              Konfirmasi <ChevronUp size={22} />
            </span>
          </button>
        </div>

      </div>

      {/* ── Add-On Order Modal ── */}
      {selectedProduct && (
        <div className="modal-overlay" onClick={() => setSelectedProduct(null)}>
          <div className="modal-content" style={{ maxWidth: '480px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>Pilih tambahan (opsional)</p>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)} 
                className="modal-close-btn"
              >
                <X size={28} strokeWidth={2.5} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-primary-lighter)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <img src={selectedProduct.image} alt={selectedProduct.name} style={{ width: 56, height: 56, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Harga dasar</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--color-primary)' }}>{formatCurrency(selectedProduct.price)}</div>
              </div>
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>Opsi Tambahan / Varian (Add-on)</div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', position: 'relative' }}>
                <div 
                  className="form-select" 
                  style={{ flex: 1, padding: '0.85rem 1rem', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', userSelect: 'none', backgroundPosition: 'right 1rem center', minHeight: '48px', borderRadius: 'var(--radius-md)' }}
                  onClick={() => setIsAddonDropdownOpen(!isAddonDropdownOpen)}
                >
                  {addonSelectId ? addOns.find(a => a.id === addonSelectId)?.name : '-- Pilih Add-on --'}
                </div>
                
                {isAddonDropdownOpen && (
                  <>
                    <div 
                      style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
                      onClick={() => setIsAddonDropdownOpen(false)} 
                    />
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: '56px', marginTop: '0.25rem', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 50, maxHeight: '200px', overflowY: 'auto' }}>
                      {addOns.filter(a => !selectedAddOns.find(sa => sa.id === a.id)).map(addon => (
                        <div 
                          key={addon.id} 
                          onClick={() => { setAddonSelectId(addon.id); setIsAddonDropdownOpen(false); }}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1rem', fontSize: '0.9rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border-light)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-alt)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span>{addon.name}</span>
                          <span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>+{formatCurrency(addon.price)}</span>
                        </div>
                      ))}
                      {addOns.filter(a => !selectedAddOns.find(sa => sa.id === a.id)).length === 0 && (
                        <div style={{ padding: '0.85rem 1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Semua add-on sudah dipilih</div>
                      )}
                    </div>
                  </>
                )}
                
                <button type="button" className="btn btn-primary" style={{ width: '48px', height: '48px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }} disabled={!addonSelectId} onClick={handleAddAddon}><Plus size={20} /></button>
              </div>

              {selectedAddOns.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedAddOns.map(addon => (
                    <div key={addon.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface-alt)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addon.name}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)' }}>+{formatCurrency(addon.price)}</div>
                        <button type="button" className="btn-icon" onClick={() => setSelectedAddOns(prev => prev.filter(a => a.id !== addon.id))} style={{ color: 'var(--color-expense)', padding: '0.35rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>Extra (Bahan Tambahan)</div>
              
              <form onSubmit={handleAddExtra} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <select 
                  className="form-select" 
                  value={extraForm.inventoryId} 
                  onChange={e => {
                    const selectedInv = inventory.find(i => i.id === e.target.value);
                    setExtraForm({ ...extraForm, inventoryId: e.target.value, price: selectedInv ? selectedInv.unitPrice.toString() : '' });
                  }}
                  style={{ flex: '1 1 135px', padding: '0.85rem 0.75rem', fontSize: '0.9rem', minHeight: '48px', borderRadius: 'var(--radius-md)' }}
                >
                  <option value="">-- Pilih Bahan --</option>
                  {inventory.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name} (Stok: {inv.quantity} {inv.unit})</option>
                  ))}
                </select>
                <input 
                  type="text" 
                  inputMode="numeric" 
                  pattern="[0-9\.]*"
                  className="form-input" 
                  value={extraForm.quantity} 
                  onChange={e => setExtraForm({ ...extraForm, quantity: e.target.value })}
                  placeholder="Qty" 
                  step="any"
                  style={{ flex: '0 1 60px', padding: '0.85rem 0.35rem', fontSize: '0.9rem', minHeight: '48px', borderRadius: 'var(--radius-md)', textAlign: 'center' }}
                />
                <input 
                  type="text" 
                  inputMode="numeric" 
                  pattern="[0-9\.]*"
                  className="form-input" 
                  value={extraForm.price ? formatCurrencyInput(extraForm.price) : ''} 
                  onChange={e => setExtraForm({ ...extraForm, price: e.target.value.replace(/[^0-9]/g, '') })}
                  placeholder="Harga (Rp)" 
                  style={{ flex: '1 1 90px', padding: '0.85rem 0.65rem', fontSize: '0.9rem', minHeight: '48px', borderRadius: 'var(--radius-md)' }}
                />
                <button type="submit" className="btn btn-primary" style={{ width: '48px', height: '48px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', flexShrink: 0 }} disabled={!extraForm.inventoryId || !extraForm.quantity}><Plus size={20} /></button>
              </form>

              {selectedExtras.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedExtras.map(extra => (
                    <div key={extra.inventoryId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface-alt)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-light)' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{extra.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{extra.quantity} {extra.unit} × {formatCurrency(extra.pricePerUnit)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)' }}>+{formatCurrency(extra.pricePerUnit * extra.quantity)}</div>
                        <button type="button" className="btn-icon" onClick={() => handleRemoveExtra(extra.inventoryId)} style={{ color: 'var(--color-expense)', padding: '0.35rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>Catatan Pesanan (Opsional)</div>
              <textarea 
                className="form-input" 
                placeholder="Catatan"
                value={productNote}
                onChange={e => setProductNote(e.target.value)}
                style={{ width: '100%', minHeight: '60px', padding: '0.85rem 1rem', fontSize: '0.9rem', borderRadius: 'var(--radius-md)', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-lg)', marginBottom: '1.5rem', border: '1px solid var(--color-border-light)' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Jumlah</div>
                <div className="flex items-center gap-4">
                  <button className="btn-icon" onClick={() => setAddOnQty(q => Math.max(1, (Number(q) || 1) - 1))} style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={18} /></button>
                  <input 
                    type="number"
                    min="1"
                    value={addOnQty}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (!isNaN(val) && val >= 1) {
                        setAddOnQty(val);
                      } else if (e.target.value === '') {
                        setAddOnQty('' as any);
                      }
                    }}
                    onBlur={() => {
                      if (!addOnQty || Number(addOnQty) < 1) setAddOnQty(1);
                    }}
                    style={{ fontSize: '1.5rem', fontWeight: 800, width: '48px', textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--color-text)', outline: 'none', padding: 0 }}
                  />
                  <button className="btn-icon" onClick={() => setAddOnQty(q => (Number(q) || 0) + 1)} style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-surface)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={18} /></button>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: '0.5rem' }}>Total</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--color-primary)' }}>
                  {formatCurrency((selectedProduct.price + selectedAddOns.reduce((s, a) => s + a.price, 0) + selectedExtras.reduce((s, e) => s + (e.pricePerUnit * e.quantity), 0)) * (Number(addOnQty) || 0))}
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="btn" style={{ flex: 1, background: 'transparent', border: '2px solid var(--color-border)', color: 'var(--color-text)', fontSize: '0.95rem', fontWeight: 600, padding: '0.85rem' }} onClick={() => setSelectedProduct(null)}>Batal</button>
              <button className="btn btn-primary" style={{ flex: 2, fontSize: '0.95rem', fontWeight: 700, padding: '0.85rem', boxShadow: '0 4px 12px rgba(var(--color-primary-rgb), 0.3)' }} onClick={confirmAddToCart}>
                <ShoppingCart size={18} style={{ marginRight: '0.5rem', display: 'inline-block' }} /> Tambah ke Keranjang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manajemen Menu Modal ── */}
      {isMenuModalOpen && (
        <div className="modal-overlay" onClick={() => { setIsMenuModalOpen(false); setEditingAddonId(null); setAddonForm({ name: '', price: '' }); }}>
          <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-xl font-bold flex items-center gap-2"><Settings size={20} /> Manajemen Menu</h2>
              <button onClick={() => { setIsMenuModalOpen(false); setEditingAddonId(null); setAddonForm({ name: '', price: '' }); }} className="modal-close-btn">
                <X size={28} strokeWidth={2.5} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.375rem', background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '0.375rem', marginBottom: '1.5rem', border: '1px solid var(--color-border-light)' }}>
              <button style={tabStyle(menuTab === 'menu')} onClick={() => setMenuTab('menu')}>
                <Settings size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Menu
              </button>
              <button style={tabStyle(menuTab === 'addon')} onClick={() => setMenuTab('addon')}>
                <Tag size={14} style={{ display: 'inline', marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Add-on ({addOns.length})
              </button>
            </div>

            {/* ─── Tab: Menu ─── */}
            {menuTab === 'menu' && (
              <>
                <div className="mb-2">
                  <h3 className="font-semibold mb-3">{editingMenuId ? 'Edit Menu' : 'Tambah Menu Baru'}</h3>
                  <form onSubmit={handleAddMenu}>
                    <div className="form-group">
                      <label className="form-label">Nama Menu</label>
                      <input type="text" className="form-input" value={newMenu.name} onChange={e => setNewMenu({ ...newMenu, name: e.target.value })} required placeholder="Nama Menu" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Harga (Rp)</label>
                      <input type="text" inputMode="numeric" pattern="[0-9\.]*" className="form-input" value={newMenu.price ? formatCurrencyInput(newMenu.price) : ''} onChange={e => setNewMenu({ ...newMenu, price: e.target.value.replace(/[^0-9]/g, '') })} required placeholder="10.000" />
                    </div>
                    <div className="form-group">
                      <label className="form-label flex items-center gap-1"><Tag size={14} /> Kategori</label>
                      <select
                        className="form-select"
                        value={newMenu.category}
                        onChange={e => setNewMenu({ ...newMenu, category: e.target.value as ProductCategory })}
                        style={{ cursor: 'pointer' }}
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label flex items-center gap-1"><ImageIcon size={14} /> Foto Menu (Opsional)</label>
                      <div className="flex items-center gap-4">
                        {newMenu.image && newMenu.image !== '/images/hot_matcha.png' && newMenu.image !== '/default-item.svg' ? (
                          <div style={{ position: 'relative', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border)' }}>
                            <img src={newMenu.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <button
                              type="button"
                              onClick={() => setNewMenu({ ...newMenu, image: '' })}
                              style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.5)', color: 'white', borderRadius: '50%', border: 'none', padding: 2, cursor: 'pointer' }}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ) : (
                          <div style={{ width: '60px', height: '60px', borderRadius: '8px', border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface-alt)' }}>
                            <ImageIcon size={20} className="text-muted" />
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <label style={{ cursor: 'pointer', padding: '0.45rem 0.85rem', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 600, background: 'var(--color-primary)', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} className="hover:opacity-90 transition-opacity">
                            ⚡ Langsung Pasang (Tanpa Crop)
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleDirectImageUpload} />
                          </label>
                          <label style={{ cursor: 'pointer', padding: '0.45rem 0.85rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 500, background: 'var(--color-surface)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }} className="hover:opacity-80 transition-opacity">
                            🖼️ Pilih & Potong (Crop)
                            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '1.25rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
                      <label className="form-label flex items-center gap-1" style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                        📦 Resep / Bahan Inventori Terhubung (Otomatis Kurang Stok)
                      </label>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Pilih bahan dari inventori yang terpakai setiap kali menu ini terjual (misal: kemasan, bumbu, atau bahan dasar).
                      </p>

                      <div className="flex gap-2 mb-3 items-center">
                        <select
                          className="form-select"
                          style={{ flex: 2, fontSize: '0.85rem' }}
                          value={selectedRecipeInvId}
                          onChange={e => setSelectedRecipeInvId(e.target.value)}
                        >
                          <option value="">-- Pilih Bahan dari Inventori --</option>
                          {inventory.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.name} (Stok: {inv.quantity} {inv.unit || 'pcs'})</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0.1"
                          step="any"
                          placeholder="Jml"
                          className="form-input"
                          style={{ width: '80px', fontSize: '0.85rem' }}
                          value={selectedRecipeQty}
                          onChange={e => setSelectedRecipeQty(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '0.55rem 0.75rem', fontSize: '0.85rem', borderColor: 'var(--color-primary)', color: 'var(--color-primary)', fontWeight: 600 }}
                          onClick={() => {
                            if (!selectedRecipeInvId || !selectedRecipeQty || Number(selectedRecipeQty) <= 0) return;
                            const invItem = inventory.find(i => i.id === selectedRecipeInvId);
                            if (!invItem) return;
                            const exists = (newMenu.recipes || []).some(r => r.inventoryId === selectedRecipeInvId);
                            if (exists) {
                              setNewMenu({
                                ...newMenu,
                                recipes: (newMenu.recipes || []).map(r => r.inventoryId === selectedRecipeInvId ? { ...r, quantity: Number(selectedRecipeQty), name: invItem.name, unit: invItem.unit || 'pcs' } : r)
                              });
                            } else {
                              setNewMenu({
                                ...newMenu,
                                recipes: [...(newMenu.recipes || []), { inventoryId: selectedRecipeInvId, quantity: Number(selectedRecipeQty), name: invItem.name, unit: invItem.unit || 'pcs' }]
                              });
                            }
                            setSelectedRecipeInvId('');
                            setSelectedRecipeQty('1');
                          }}
                        >
                          + Hubungkan
                        </button>
                      </div>

                      {newMenu.recipes && newMenu.recipes.length > 0 && (
                        <div style={{ background: 'var(--color-surface-alt)', borderRadius: 'var(--radius-md)', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', border: '1px solid var(--color-border-light)' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Bahan terikat dengan menu ini:</div>
                          {newMenu.recipes.map((r, i) => {
                            const invItem = inventory.find(inv => inv.id === r.inventoryId);
                            const name = r.name || invItem?.name || 'Bahan Inventori';
                            const unit = r.unit || invItem?.unit || 'pcs';
                            return (
                              <div key={r.inventoryId || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', border: '1px solid var(--color-border)' }}>
                                <span><strong>{name}</strong> : terpakai <strong>{r.quantity} {unit}</strong> / pcs menu</span>
                                <button
                                  type="button"
                                  onClick={() => setNewMenu({ ...newMenu, recipes: (newMenu.recipes || []).filter(item => item.inventoryId !== r.inventoryId) })}
                                  style={{ color: 'var(--color-expense)', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 4px', fontWeight: 'bold' }}
                                >
                                  ✕
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end" style={{ marginTop: '1rem' }}>
                      <div className="flex gap-2">
                        <button type="submit" className="btn btn-primary flex-1 btn-add-menu" disabled={isSubmitting || !isActiveSubscription} title={!isActiveSubscription ? 'Terkunci karena masa trial habis' : ''}>
                          <Plus size={16} className="mr-1" style={{ display: 'inline' }} />
                          {editingMenuId ? 'Simpan Perubahan' : 'Tambah Menu'}
                        </button>
                        {editingMenuId && (
                          <button type="button" className="btn btn-outline" onClick={() => {
                            setEditingMenuId(null);
                            setNewMenu({ name: '', price: '', image: '', category: categories[0] || '', recipes: [] });
                            setSelectedRecipeInvId('');
                            setSelectedRecipeQty('1');
                          }} disabled={isSubmitting}>
                            Batal
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                </div>
                <div style={{ marginTop: '2.5rem' }}>
                  <h3 className="font-semibold mb-6 flex items-center gap-4">
                    <span>
                      Daftar Menu <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>(Bisa di-drag untuk ubah kategori)</span>
                    </span>
                    <div className="flex-1 border-b mt-1" style={{ borderColor: 'var(--color-border-light)' }}></div>
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', paddingBottom: '1rem' }}>
                    {[...categories, 'other'].map(cat => {
                      const catProducts = products.filter(p => {
                        if (cat === 'other') {
                          return !p.category || !categories.includes(p.category);
                        }
                        return p.category === cat;
                      });
                      const isOver = draggedOverTab === cat;
                      const catLabel = cat === 'other' ? 'Lainnya' : cat;
                      
                      // Hide "Lainnya" if it's empty to keep UI clean, unless dragging over it
                      if (cat === 'other' && catProducts.length === 0 && !isOver) return null;

                      return (
                        <div
                          key={cat}
                          onDragOver={(e) => handleDragOver(e, cat)}
                          onDragEnter={(e) => handleDragEnter(e, cat)}
                          onDragLeave={(e) => handleDragLeave(e, cat)}
                          onDrop={(e) => handleDrop(e, cat)}
                          style={{
                            background: isOver ? 'var(--color-primary-lighter)' : 'var(--color-surface)',
                            border: isOver ? '2px dashed var(--color-primary)' : '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem',
                            transition: 'all 0.2s ease',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
                            {catLabel} <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontWeight: 500 }}>({catProducts.length})</span>
                          </div>
                          <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
                            {catProducts.length === 0 ? (
                              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)', textAlign: 'center', padding: '1rem 0' }}>Kosong</div>
                            ) : catProducts.map(p => {
                              const isDraggingThis = draggedProductId === p.id;
                              return (
                                <div
                                  key={p.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, p.id)}
                                  onDragEnd={handleDragEnd}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '0.6rem',
                                    border: '1px solid var(--color-border-light)',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'var(--color-surface-alt)',
                                    cursor: 'grab',
                                    opacity: isDraggingThis ? 0.5 : 1,
                                    transform: isDraggingThis ? 'scale(0.95)' : 'none',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                                    <img src={p.image || '/default-item.svg'} draggable={false} alt={p.name} onError={(e) => { if (!e.currentTarget.src.endsWith('/default-item.svg')) e.currentTarget.src = '/default-item.svg'; }} style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontWeight: 600, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                                      <div style={{ color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 700 }}>{formatCurrency(p.price)}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <button className="btn-icon" disabled={!isActiveSubscription} onClick={() => {
                                      setEditingMenuId(p.id);
                                      setNewMenu({ name: p.name, price: p.price.toString(), image: p.image, category: p.category || categories[0] || '', recipes: p.recipes || [] });
                                      setSelectedRecipeInvId('');
                                      setSelectedRecipeQty('1');
                                      setActionReason({ name: '', reason: '' });
                                      window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }} style={{ color: isActiveSubscription ? 'var(--color-primary)' : 'var(--color-text-light)', flexShrink: 0, padding: '0.25rem', opacity: isActiveSubscription ? 1 : 0.5 }} title="Edit">
                                      <Pencil size={14} />
                                    </button>
                                    <button className="btn-icon" disabled={!isActiveSubscription} onClick={() => { setDeleteMenuConfirm({ id: p.id, name: p.name }); setActionReason({ name: '', reason: '' }); }} style={{ color: isActiveSubscription ? 'var(--color-expense)' : 'var(--color-text-light)', flexShrink: 0, padding: '0.25rem', opacity: isActiveSubscription ? 1 : 0.5 }} title="Hapus">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ─── Tab: Add-on ─── */}
            {menuTab === 'addon' && (
              <>
                {/* Form tambah/edit */}
                <div className="mb-2">
                  <h3 className="font-semibold mb-3">{editingAddonId ? 'Edit Add-on' : 'Tambah Add-on Baru'}</h3>
                  <form onSubmit={handleSaveAddon}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Nama Add-on</label>
                        <input
                          type="text" className="form-input"
                          value={addonForm.name}
                          onChange={e => setAddonForm({ ...addonForm, name: e.target.value })}
                          required placeholder="Nama Add-on"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Harga Tambahan (Rp)</label>
                        <input
                          type="text" inputMode="numeric" pattern="[0-9\.]*" className="form-input"
                          value={addonForm.price ? formatCurrencyInput(addonForm.price) : ''}
                          onChange={e => setAddonForm({ ...addonForm, price: e.target.value.replace(/[^0-9]/g, '') })}
                          required placeholder="5.000"
                        />
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2" style={{ marginTop: '1rem' }}>
                      {editingAddonId && (
                        <button type="button" className="btn btn-outline" onClick={() => { setEditingAddonId(null); setAddonForm({ name: '', price: '' }); }}>Batal</button>
                      )}
                      <button type="submit" className="btn btn-primary btn-add-menu" disabled={!isActiveSubscription}>
                        {editingAddonId ? <><Check size={14} /> Simpan Perubahan</> : <><Plus size={14} /> Tambah Add-on</>}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Daftar add-on */}
                <div style={{ marginTop: '2.5rem' }}>
                  <h3 className="font-semibold mb-6 flex items-center gap-4">
                    <span>Daftar Add-on ({addOns.length})</span>
                    <div className="flex-1 border-b mt-1" style={{ borderColor: 'var(--color-border-light)' }}></div>
                  </h3>
                  <div style={{ maxHeight: '280px', overflowY: 'auto' }} className="flex flex-col gap-2">
                    {addOns.length === 0 ? (
                      <div className="text-center text-muted p-4 text-sm">Belum ada add-on.</div>
                    ) : addOns.map(addon => (
                      <div key={addon.id} className="flex justify-between items-center p-3" style={{ border: editingAddonId === addon.id ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', background: editingAddonId === addon.id ? 'var(--color-primary-lighter)' : 'var(--color-surface-alt)' }}>
                        <div className="flex items-center gap-3">
                          <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--color-primary-lighter)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Tag size={16} style={{ color: 'var(--color-primary)' }} />
                          </div>
                          <div>
                            <div className="font-semibold text-sm">{addon.name}</div>
                            <div className="text-primary text-xs font-bold">+{formatCurrency(addon.price)}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button className="btn-icon" disabled={!isActiveSubscription} onClick={() => openEditAddon(addon)} title="Edit" style={{ opacity: isActiveSubscription ? 1 : 0.5 }}><Pencil size={14} /></button>
                          <button className="btn-icon" disabled={!isActiveSubscription} onClick={() => { setDeleteAddonId(addon.id); setActionReason({ name: '', reason: '' }); }} style={{ color: isActiveSubscription ? 'var(--color-expense)' : 'var(--color-text)', opacity: isActiveSubscription ? 1 : 0.5 }} title="Hapus"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}


          </div>
        </div>
      )}

      {/* ── Konfirmasi hapus add-on ── */}
      {deleteAddonId && (
        <div className="modal-overlay" style={{ zIndex: 2010 }} onClick={() => setDeleteAddonId(null)}>
          <div className="modal-content" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-expense-bg)', display: 'flex', alignItems: 'center', margin: '0 auto 1rem' }}>
                <Trash2 size={22} style={{ color: 'var(--color-expense)', margin: 'auto' }} />
              </div>
              <h2 className="text-lg font-bold mb-2 text-center">Hapus Add-on?</h2>
              <p className="text-sm text-secondary mb-4 text-center">Add-on ini akan dihapus permanen.</p>
              
              <div className="flex justify-center gap-2">
                <button className="btn btn-outline" onClick={() => setDeleteAddonId(null)}>Batal</button>
                <button className="btn btn-danger" onClick={() => handleDeleteAddon(deleteAddonId)} disabled={isDeleting}>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Konfirmasi hapus menu ── */}
      {deleteMenuConfirm && (
        <div className="modal-overlay" style={{ zIndex: 2010 }} onClick={() => setDeleteMenuConfirm(null)}>
          <div className="modal-content" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-expense-bg)', display: 'flex', alignItems: 'center', margin: '0 auto 1rem' }}>
                <Trash2 size={22} style={{ color: 'var(--color-expense)', margin: 'auto' }} />
              </div>
              <h2 className="text-lg font-bold mb-2 text-center">Hapus Menu?</h2>
              <p className="text-sm text-secondary mb-4 text-center">Menu "{deleteMenuConfirm.name}" akan dihapus permanen.</p>
              
              <div style={{ textAlign: 'left', marginBottom: '1.5rem' }}>
                <div className="form-group mb-3">
                  <input type="text" className="form-input" placeholder="Nama Anda" value={actionReason.name} onChange={e => setActionReason({...actionReason, name: e.target.value})} />
                </div>
                <div className="form-group mb-0">
                  <input type="text" className="form-input" placeholder="Alasan penghapusan" value={actionReason.reason} onChange={e => setActionReason({...actionReason, reason: e.target.value})} />
                </div>
              </div>

              <div className="flex justify-center gap-2">
                <button className="btn btn-outline" onClick={() => setDeleteMenuConfirm(null)}>Batal</button>
                <button className="btn btn-danger" onClick={() => handleDeleteMenu(deleteMenuConfirm.id, deleteMenuConfirm.name)} disabled={isDeleting}>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Transaksi Berhasil Modal ── */}
      {showSuccessModal && lastTransaction && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
          onClick={() => { setShowSuccessModal(false); setLastTransaction(null); setIsCheckoutOpen(false); }}
        >
          <div 
            className="modal-content" 
            style={{ maxWidth: '400px', textAlign: 'center', margin: '0 auto', width: '90%' }} 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => { setShowSuccessModal(false); setLastTransaction(null); setIsCheckoutOpen(false); }} 
              className="modal-close-btn"
            >
              <X size={24} strokeWidth={2.5} />
            </button>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
              <CheckCircle size={32} style={{ color: 'var(--color-income)' }} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem', color: 'var(--color-text)' }}>Transaksi Berhasil!</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              Pembayaran via <strong>{lastTransaction.paymentMethod}</strong> sebesar <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(lastTransaction.total)}</strong> telah diterima.
            </p>

            {lastTransaction.customerPhone && (
              <div style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '12px', padding: '0.75rem 1rem', marginBottom: '1.25rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <MessageCircle size={26} color="#22C55E" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>Member: {lastTransaction.customerName || 'Pelanggan'} ({lastTransaction.customerPhone}) {lastTransaction.purchaseCount ? `• Pembelian ke-${lastTransaction.purchaseCount} 🎉` : ''}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Pesan ucapan & struk WhatsApp otomatis terbuka!</div>
                </div>
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lastTransaction.customerPhone && (
                <button 
                  className="btn" 
                  onClick={() => sendWhatsAppToMember(lastTransaction)}
                  style={{ padding: '0.85rem', width: '100%', background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)', color: '#fff', border: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)', cursor: 'pointer', borderRadius: 'var(--radius-md)' }}
                >
                  <MessageCircle size={18} /> Kirim Ulang Struk WhatsApp
                </button>
              )}
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  setTimeout(() => {
                    window.print();
                  }, 100);
                }}
                style={{ padding: '0.85rem', width: '100%' }}
              >
                <Printer size={18} /> Cetak Struk
              </button>
              <button 
                className="btn btn-outline" 
                onClick={() => {
                  setShowSuccessModal(false);
                  setLastTransaction(null);
                  setIsCheckoutOpen(false);
                }}
                style={{ padding: '0.85rem', width: '100%' }}
              >
                Selesai (Pesanan Baru)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── QRIS Dynamic Modal ── */}
      {showQRISModal && (
        <div 
          className="modal-overlay" 
          style={{ zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} 
          onClick={() => setShowQRISModal(false)}
        >
          <style>{`
            @keyframes qris-pulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(99, 190, 123, 0.4); }
              50% { box-shadow: 0 0 0 14px rgba(99, 190, 123, 0); }
            }
            @keyframes qris-badge-in {
              from { opacity: 0; transform: translateY(8px) scale(0.9); }
              to { opacity: 1; transform: translateY(0) scale(1); }
            }
            .qris-qr-wrapper {
              animation: qris-pulse 2.5s ease-in-out infinite;
              border-radius: 20px;
              display: inline-block;
            }
            .qris-badge {
              animation: qris-badge-in 0.4s ease-out forwards;
            }
          `}</style>
          <div 
            className="modal-content" 
            style={{ 
              maxWidth: '420px', 
              width: '100%',
              padding: 0,
              overflow: 'hidden',
              borderRadius: '24px',
              border: 'none',
              boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
            }} 
            onClick={e => e.stopPropagation()}
          >
            {/* ── Gradient Header ── */}
            <div style={{
              background: paymentMethod === 'DANA'
                ? 'linear-gradient(135deg, #118EEA 0%, #0671C6 100%)'
                : paymentMethod === 'GoPay'
                ? 'linear-gradient(135deg, #00AED6 0%, #007AB8 100%)'
                : 'linear-gradient(135deg, #3DAA6A 0%, #1E7D46 100%)',
              padding: '1.5rem 1.5rem 3.5rem',
              position: 'relative',
              textAlign: 'center',
            }}>
              <button 
                onClick={() => setShowQRISModal(false)} 
                style={{
                  position: 'absolute', top: '1rem', right: '1rem',
                  background: 'rgba(255,255,255,0.2)', border: 'none',
                  color: 'white', borderRadius: '50%', width: 36, height: 36,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', backdropFilter: 'blur(4px)',
                }}
              >
                <X size={18} strokeWidth={2.5} />
              </button>

              {/* App logo row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                <div style={{
                  background: 'rgba(255,255,255,0.95)',
                  borderRadius: '10px',
                  padding: '5px 10px',
                  fontWeight: 900,
                  fontSize: '0.8rem',
                  letterSpacing: '0.5px',
                  color: paymentMethod === 'DANA' ? '#118EEA' : paymentMethod === 'GoPay' ? '#00AED6' : '#3DAA6A',
                }}>
                  {paymentMethod === 'DANA' ? 'DANA' : paymentMethod === 'GoPay' ? 'GoPay' : 'QRIS'}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>×</span>
                <div style={{
                  background: 'rgba(255,255,255,0.2)',
                  borderRadius: '10px',
                  padding: '5px 10px',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: 'white',
                  border: '1px solid rgba(255,255,255,0.3)',
                }}>
                  Vrimae
                </div>
              </div>

              <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.88rem', marginBottom: '0.4rem' }}>
                Total Pembayaran
              </p>
              <div style={{
                fontSize: 'clamp(1.8rem, 6vw, 2.4rem)',
                fontWeight: 900,
                color: 'white',
                letterSpacing: '-0.5px',
                textShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {formatCurrency(calculateTotal())}
              </div>
            </div>

            {/* ── QR Code Card (floating over header) ── */}
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center',
              padding: '0 1.5rem 1.5rem',
              background: 'var(--color-surface)',
              position: 'relative',
            }}>
              {/* QR floating card */}
              <div style={{
                marginTop: '-2.5rem',
                background: 'white',
                borderRadius: '20px',
                padding: '1.25rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                width: 'fit-content',
                marginBottom: '1.25rem',
              }}>
                <div className="qris-qr-wrapper">
                  <QRCodeSVG 
                    value={dynamicQRIS} 
                    size={200}
                    level="M" 
                    includeMargin={false}
                    style={{ display: 'block', borderRadius: '8px' }}
                  />
                </div>
                {/* QRIS label below QR */}
                <div style={{
                  marginTop: '0.75rem',
                  textAlign: 'center',
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  letterSpacing: '2px',
                  color: '#888',
                  textTransform: 'uppercase',
                }}>
                  ▊▊ QRIS ▊▊
                </div>
              </div>

              {/* App badges */}
              <div className="qris-badge" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                marginBottom: '1rem',
                flexWrap: 'wrap',
              }}>
                {['DANA', 'GoPay', 'ShopeePay', 'm-Banking'].map(app => (
                  <span key={app} style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: app === 'DANA' ? 'rgba(17,142,234,0.12)' 
                              : app === 'GoPay' ? 'rgba(0,174,214,0.12)' 
                              : app === 'ShopeePay' ? 'rgba(238,78,36,0.1)'
                              : 'var(--color-surface-alt)',
                    color: app === 'DANA' ? '#118EEA' 
                         : app === 'GoPay' ? '#00AED6' 
                         : app === 'ShopeePay' ? '#EE4E24'
                         : 'var(--color-text-secondary)',
                    border: `1px solid ${app === 'DANA' ? 'rgba(17,142,234,0.25)' 
                           : app === 'GoPay' ? 'rgba(0,174,214,0.25)' 
                           : app === 'ShopeePay' ? 'rgba(238,78,36,0.2)'
                           : 'var(--color-border)'}`,
                  }}>
                    {app}
                  </span>
                ))}
              </div>

              {/* Hint */}
              <p style={{
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
                lineHeight: 1.6,
                marginBottom: '1.25rem',
                padding: '0 0.5rem',
              }}>
                Arahkan kamera ke QR di atas. Nominal <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(calculateTotal())}</strong> akan terisi otomatis.
              </p>

              {/* Confirm Button */}
              <button 
                className="btn btn-primary" 
                onClick={() => {
                  setShowQRISModal(false);
                  processTransaction();
                }}
                disabled={isSubmitting}
                style={{ 
                  width: '100%', 
                  padding: '1rem', 
                  fontSize: '1rem', 
                  fontWeight: 700,
                  borderRadius: '14px',
                  background: isSubmitting ? undefined : paymentMethod === 'DANA'
                    ? 'linear-gradient(135deg, #118EEA, #0671C6)'
                    : paymentMethod === 'GoPay'
                    ? 'linear-gradient(135deg, #00AED6, #007AB8)'
                    : undefined,
                  border: 'none',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                }}
              >
                <CheckCircle size={20} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Konfirmasi Uang Masuk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Crop Image Modal */}
      {cropImageSrc && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setCropImageSrc(null)}>
          <div className="modal-content" style={{ maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem', height: '70vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="text-xl font-bold flex items-center gap-2"><ImageIcon size={20} /> Sesuaikan Foto</h2>
              <button onClick={() => setCropImageSrc(null)} className="modal-close-btn">
                <X size={28} strokeWidth={2.5} />
              </button>
            </div>
            <div style={{ position: 'relative', flex: 1, width: '100%', background: '#333', borderRadius: '8px', overflow: 'hidden' }}>
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixels(croppedAreaPixels)}
                onZoomChange={setZoom}
              />
            </div>
            <div style={{ padding: '0 0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Perbesar (Zoom)</label>
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', color: 'var(--color-text)' }}>
              💡 <em>Catatan:</em> Jika foto tampak kosong/abu-abu di atas (karena kendala kompatibilitas browser/kamera HP), silakan klik tombol <strong>"Gunakan Tanpa Potong"</strong> untuk tetap memasang foto tanpa error.
            </div>
            <div className="flex flex-wrap gap-2 justify-end mt-2">
              <button type="button" className="btn btn-outline" onClick={() => setCropImageSrc(null)}>Batal</button>
              <button type="button" className="btn btn-outline" style={{ border: '1px solid var(--color-primary)', color: 'var(--color-primary)', fontWeight: 600 }} onClick={async () => {
                if (cropImageSrc) {
                  const compressed = await compressImage(cropImageSrc, 450, 0.75);
                  setNewMenu({ ...newMenu, image: compressed });
                  setCropImageSrc(null);
                }
              }}>
                Gunakan Tanpa Potong
              </button>
              <button type="button" className="btn btn-primary" onClick={async () => {
                if (cropImageSrc) {
                  try {
                    const targetCrop = croppedAreaPixels || { x: 0, y: 0, width: 450, height: 450 };
                    const croppedImage = await getCroppedImg(cropImageSrc, targetCrop);
                    setNewMenu({ ...newMenu, image: croppedImage });
                  } catch (e) {
                    console.warn('Fallback ke foto asli terkompresi', e);
                    const compressed = await compressImage(cropImageSrc, 450, 0.75);
                    setNewMenu({ ...newMenu, image: compressed });
                  }
                  setCropImageSrc(null);
                }
              }}>
                <Check size={16} className="mr-1" style={{ display: 'inline' }} />
                Potong & Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Komponen Struk (Hanya terlihat saat diprint) */}
      {lastTransaction && <Receipt transaction={lastTransaction} />}

    </div>
  );
};

export default POS;
