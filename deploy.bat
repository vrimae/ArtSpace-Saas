@echo off
echo ===================================================
echo Mengunggah Pembaruan (Git Push) ke GitHub...
echo ===================================================

git add .
git commit -m "feat: mengganti resep dengan fitur extra bahan baku"
git push

echo.
echo ===================================================
echo Selesai! Jika tidak ada pesan error di atas,
echo Vercel akan otomatis melakukan deploy pembaruan website Anda.
echo ===================================================
pause
