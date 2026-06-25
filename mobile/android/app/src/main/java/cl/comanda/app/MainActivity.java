package cl.comanda.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private BluetoothPrinterBridge bluetoothPrinterBridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        bluetoothPrinterBridge = new BluetoothPrinterBridge(this);
        getBridge().getWebView().addJavascriptInterface(bluetoothPrinterBridge, "ComandaAndroidPrinter");
        bluetoothPrinterBridge.requestStartupPermissionsIfNeeded();
    }
}
