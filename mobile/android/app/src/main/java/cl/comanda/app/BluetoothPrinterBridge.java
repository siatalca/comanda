package cl.comanda.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

public class BluetoothPrinterBridge {

    private static final int REQUEST_BLUETOOTH_PERMISSIONS = 4103;
    private static final String PREFS_NAME = "ComandaBluetoothPrinter";
    private static final String PREF_PRINTER_ADDRESS = "printer_address";
    private static final String PREF_PRINTER_NAME = "printer_name";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String TRUSTED_HOST = "comanda.mi-registro.cl";

    private final Activity activity;

    public BluetoothPrinterBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String isAvailable() {
        try {
            JSONObject data = baseOk();
            data.put("available", getBluetoothAdapter() != null);
            data.put("enabled", isBluetoothEnabled());
            data.put("permission_granted", hasBluetoothRuntimePermissions());
            return data.toString();
        } catch (JSONException error) {
            return errorJson("json_error", error.getMessage());
        }
    }

    @JavascriptInterface
    public String openBluetoothSettings() {
        activity.runOnUiThread(() -> {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            activity.startActivity(intent);
        });
        return okMessage("Abriendo ajustes Bluetooth.");
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    public String listPairedPrinters() {
        if (!isTrustedOrigin()) {
            return errorJson("origin_not_allowed", "Esta pagina no puede usar la impresora Bluetooth.");
        }
        if (!hasBluetoothRuntimePermissions()) {
            requestBluetoothRuntimePermissions();
            return errorJson("permission_required", "Autoriza Dispositivos cercanos y vuelve a intentar.");
        }
        if (!ensureBluetoothReady()) {
            return errorJson("bluetooth_unavailable", "Bluetooth no esta disponible o esta desactivado.");
        }

        try {
            String selectedAddress = getPrefs().getString(PREF_PRINTER_ADDRESS, "");
            JSONArray devices = new JSONArray();
            Set<BluetoothDevice> bondedDevices = getBluetoothAdapter().getBondedDevices();
            for (BluetoothDevice device : bondedDevices) {
                JSONObject item = new JSONObject();
                item.put("name", safeDeviceName(device));
                item.put("address", device.getAddress());
                item.put("selected", device.getAddress().equals(selectedAddress));
                item.put("likely_printer", looksLikePrinter(safeDeviceName(device)));
                devices.put(item);
            }

            JSONObject data = baseOk();
            data.put("devices", devices);
            data.put("selected", selectedPrinterJson());
            return data.toString();
        } catch (SecurityException | JSONException error) {
            return errorJson("list_failed", error.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    public String selectPrinter(String address) {
        if (!isTrustedOrigin()) {
            return errorJson("origin_not_allowed", "Esta pagina no puede usar la impresora Bluetooth.");
        }
        if (!hasBluetoothRuntimePermissions()) {
            requestBluetoothRuntimePermissions();
            return errorJson("permission_required", "Autoriza Dispositivos cercanos y vuelve a intentar.");
        }
        if (!ensureBluetoothReady()) {
            return errorJson("bluetooth_unavailable", "Bluetooth no esta disponible o esta desactivado.");
        }

        BluetoothDevice device = findBondedDeviceByAddress(address);
        if (device == null) {
            return errorJson("printer_not_found", "No encontre esa impresora emparejada.");
        }

        getPrefs()
            .edit()
            .putString(PREF_PRINTER_ADDRESS, device.getAddress())
            .putString(PREF_PRINTER_NAME, safeDeviceName(device))
            .apply();

        try {
            JSONObject data = baseOk();
            data.put("message", "Impresora seleccionada.");
            data.put("printer", selectedPrinterJson());
            return data.toString();
        } catch (JSONException error) {
            return errorJson("json_error", error.getMessage());
        }
    }

    @JavascriptInterface
    public String getSelectedPrinter() {
        try {
            JSONObject data = baseOk();
            data.put("printer", selectedPrinterJson());
            return data.toString();
        } catch (JSONException error) {
            return errorJson("json_error", error.getMessage());
        }
    }

    @SuppressLint("MissingPermission")
    @JavascriptInterface
    public String printText(String text, String label) {
        if (!isTrustedOrigin()) {
            return errorJson("origin_not_allowed", "Esta pagina no puede usar la impresora Bluetooth.");
        }
        if (!hasBluetoothRuntimePermissions()) {
            requestBluetoothRuntimePermissions();
            return errorJson("permission_required", "Autoriza Dispositivos cercanos y vuelve a intentar.");
        }
        if (!ensureBluetoothReady()) {
            return errorJson("bluetooth_unavailable", "Bluetooth no esta disponible o esta desactivado.");
        }

        String cleanText = String.valueOf(text == null ? "" : text).trim();
        if (cleanText.isEmpty()) {
            return errorJson("empty_ticket", "El ticket esta vacio.");
        }

        BluetoothDevice device = resolvePrinterDevice();
        if (device == null) {
            return errorJson("printer_not_selected", "Empareja o selecciona una impresora Bluetooth.");
        }

        BluetoothSocket socket = null;
        try {
            socket = connectToDevice(device);
            OutputStream output = socket.getOutputStream();
            output.write(new byte[] { 0x1B, 0x40 });
            output.write(new byte[] { 0x1B, 0x74, 0x02 });
            output.write(normalizeTicket(cleanText).getBytes(printerCharset()));
            output.write(new byte[] { 0x0A, 0x0A, 0x0A });
            output.write(new byte[] { 0x1D, 0x56, 0x42, 0x00 });
            output.flush();

            JSONObject data = baseOk();
            data.put("message", "Ticket enviado por Bluetooth.");
            data.put("printer", safeDeviceName(device));
            data.put("address", device.getAddress());
            data.put("label", String.valueOf(label == null ? "ticket" : label));
            return data.toString();
        } catch (IOException | SecurityException | JSONException error) {
            return errorJson("print_failed", error.getMessage());
        } finally {
            if (socket != null) {
                try {
                    socket.close();
                } catch (IOException ignored) {
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    private BluetoothSocket connectToDevice(BluetoothDevice device) throws IOException {
        BluetoothAdapter adapter = getBluetoothAdapter();
        if (adapter != null && hasBluetoothScanPermission()) {
            try {
                adapter.cancelDiscovery();
            } catch (SecurityException ignored) {
            }
        }

        BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
        try {
            socket.connect();
            return socket;
        } catch (IOException firstError) {
            try {
                socket.close();
            } catch (IOException ignored) {
            }

            BluetoothSocket insecureSocket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
            insecureSocket.connect();
            return insecureSocket;
        }
    }

    public void requestStartupPermissionsIfNeeded() {
        if (!hasBluetoothRuntimePermissions()) {
            requestBluetoothRuntimePermissions();
        }
    }

    private boolean ensureBluetoothReady() {
        BluetoothAdapter adapter = getBluetoothAdapter();
        return adapter != null && adapter.isEnabled();
    }

    private boolean isBluetoothEnabled() {
        BluetoothAdapter adapter = getBluetoothAdapter();
        try {
            return adapter != null && adapter.isEnabled();
        } catch (SecurityException error) {
            return false;
        }
    }

    private boolean hasBluetoothRuntimePermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return hasBluetoothConnectPermission() && hasBluetoothScanPermission();
    }

    private boolean hasBluetoothConnectPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBluetoothScanPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestBluetoothRuntimePermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return;
        }
        activity.runOnUiThread(() ->
            ActivityCompat.requestPermissions(
                activity,
                new String[] {
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                },
                REQUEST_BLUETOOTH_PERMISSIONS
            )
        );
    }

    private BluetoothAdapter getBluetoothAdapter() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            BluetoothManager manager = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
            return manager != null ? manager.getAdapter() : null;
        }
        return BluetoothAdapter.getDefaultAdapter();
    }

    @SuppressLint("MissingPermission")
    private BluetoothDevice resolvePrinterDevice() {
        String selectedAddress = getPrefs().getString(PREF_PRINTER_ADDRESS, "");
        BluetoothDevice selected = findBondedDeviceByAddress(selectedAddress);
        if (selected != null) {
            return selected;
        }

        BluetoothDevice preferred = null;
        BluetoothDevice first = null;
        Set<BluetoothDevice> bondedDevices = getBluetoothAdapter().getBondedDevices();
        for (BluetoothDevice device : bondedDevices) {
            if (first == null) {
                first = device;
            }
            if (looksLikePrinter(safeDeviceName(device))) {
                preferred = device;
                break;
            }
        }
        return preferred != null ? preferred : first;
    }

    @SuppressLint("MissingPermission")
    private BluetoothDevice findBondedDeviceByAddress(String address) {
        String expected = String.valueOf(address == null ? "" : address).trim();
        if (expected.isEmpty() || getBluetoothAdapter() == null) {
            return null;
        }
        for (BluetoothDevice device : getBluetoothAdapter().getBondedDevices()) {
            if (expected.equalsIgnoreCase(device.getAddress())) {
                return device;
            }
        }
        return null;
    }

    @SuppressLint("MissingPermission")
    private String safeDeviceName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Bluetooth " + device.getAddress() : name.trim();
        } catch (SecurityException error) {
            return "Bluetooth";
        }
    }

    private boolean looksLikePrinter(String name) {
        String value = String.valueOf(name == null ? "" : name).toLowerCase(Locale.ROOT);
        return value.contains("print") ||
            value.contains("printer") ||
            value.contains("pos") ||
            value.contains("thermal") ||
            value.contains("58") ||
            value.contains("xp-") ||
            value.contains("xprinter");
    }

    private String normalizeTicket(String text) {
        return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\r\n") + "\r\n";
    }

    private Charset printerCharset() {
        try {
            return Charset.forName("CP850");
        } catch (Exception ignored) {
            return StandardCharsets.UTF_8;
        }
    }

    private SharedPreferences getPrefs() {
        return activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private JSONObject selectedPrinterJson() throws JSONException {
        JSONObject printer = new JSONObject();
        String address = getPrefs().getString(PREF_PRINTER_ADDRESS, "");
        String name = getPrefs().getString(PREF_PRINTER_NAME, "");
        printer.put("address", address);
        printer.put("name", name);
        printer.put("selected", !address.isEmpty());
        return printer;
    }

    private boolean isTrustedOrigin() {
        String url = currentWebViewUrl();
        if (url == null || url.trim().isEmpty()) {
            return false;
        }

        Uri uri = Uri.parse(url);
        String scheme = String.valueOf(uri.getScheme() == null ? "" : uri.getScheme()).toLowerCase(Locale.ROOT);
        if ("file".equals(scheme) || "capacitor".equals(scheme)) {
            return true;
        }
        if (!"http".equals(scheme) && !"https".equals(scheme)) {
            return false;
        }

        String host = String.valueOf(uri.getHost() == null ? "" : uri.getHost()).toLowerCase(Locale.ROOT);
        return TRUSTED_HOST.equals(host) ||
            "localhost".equals(host) ||
            "127.0.0.1".equals(host) ||
            host.endsWith(".local") ||
            isPrivateIpv4(host);
    }

    private String currentWebViewUrl() {
        final String[] currentUrl = { "" };
        CountDownLatch latch = new CountDownLatch(1);
        activity.runOnUiThread(() -> {
            try {
                if (activity instanceof BridgeActivity) {
                    BridgeActivity bridgeActivity = (BridgeActivity) activity;
                    if (bridgeActivity.getBridge() != null && bridgeActivity.getBridge().getWebView() != null) {
                        currentUrl[0] = bridgeActivity.getBridge().getWebView().getUrl();
                    }
                }
            } finally {
                latch.countDown();
            }
        });

        try {
            latch.await(1, TimeUnit.SECONDS);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
        return currentUrl[0];
    }

    private boolean isPrivateIpv4(String host) {
        String[] parts = host.split("\\.");
        if (parts.length != 4) {
            return false;
        }

        try {
            int first = Integer.parseInt(parts[0]);
            int second = Integer.parseInt(parts[1]);
            if (first == 10 || first == 192 && second == 168) {
                return true;
            }
            return first == 172 && second >= 16 && second <= 31;
        } catch (NumberFormatException error) {
            return false;
        }
    }

    private JSONObject baseOk() throws JSONException {
        JSONObject data = new JSONObject();
        data.put("ok", true);
        return data;
    }

    private String okMessage(String message) {
        try {
            JSONObject data = baseOk();
            data.put("message", message);
            return data.toString();
        } catch (JSONException error) {
            return errorJson("json_error", error.getMessage());
        }
    }

    private String errorJson(String code, String message) {
        try {
            JSONObject data = new JSONObject();
            data.put("ok", false);
            data.put("code", code);
            data.put("error", message == null || message.trim().isEmpty() ? "Error Bluetooth." : message);
            return data.toString();
        } catch (JSONException error) {
            return "{\"ok\":false,\"code\":\"json_error\",\"error\":\"Error Bluetooth.\"}";
        }
    }
}
