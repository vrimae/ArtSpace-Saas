@echo off
echo ===================================================
echo Memulai proses deploy ke Vercel...
echo ===================================================

npx vercel --prod --yes --token vcp_5iGrTM3hCUyySeJzt8VyzQxCCNGZY1abahUCnDa3Sly7SWBJeT3ELyct

echo.
echo ===================================================
echo Selesai! Jika tidak ada pesan error merah di atas,
echo website Anda telah berhasil diperbarui!
echo ===================================================
pause
