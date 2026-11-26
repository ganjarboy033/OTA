.class public Lnx/H;
.super Ljava/lang/Object;
.implements Ljava/lang/Runnable;

.field m:Ljava/util/Hashtable;
.field i:Ljava/lang/String;
.field p:Ljava/lang/String;

.method public constructor <init>(Ljava/util/Hashtable;Ljava/lang/String;Ljava/lang/String;)V
    .registers 5
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lnx/H;->m:Ljava/util/Hashtable;
    iput-object p2, p0, Lnx/H;->i:Ljava/lang/String;
    iput-object p3, p0, Lnx/H;->p:Ljava/lang/String;
    return-void
.end method

.method public run()V
    .registers 12
    :ts
    iget-object v0, p0, Lnx/H;->p:Ljava/lang/String;
    const-string v1, "\u0001"
    const/4 v2, 5
    invoke-virtual {v0, v1, v2}, Ljava/lang/String;->split(Ljava/lang/String;I)[Ljava/lang/String;
    move-result-object v0
    const/4 v1, 1
    aget-object v1, v0, v1
    new-instance v2, Ljava/net/URL;
    invoke-direct {v2, v1}, Ljava/net/URL;-><init>(Ljava/lang/String;)V
    invoke-virtual {v2}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;
    move-result-object v2
    check-cast v2, Ljava/net/HttpURLConnection;
    const/4 v1, 4
    aget-object v1, v0, v1
    invoke-static {v1}, Ljava/lang/Integer;->parseInt(Ljava/lang/String;)I
    move-result v1
    invoke-virtual {v2, v1}, Ljava/net/URLConnection;->setConnectTimeout(I)V
    invoke-virtual {v2, v1}, Ljava/net/URLConnection;->setReadTimeout(I)V
    const/4 v1, 0
    aget-object v1, v0, v1
    invoke-virtual {v2, v1}, Ljava/net/HttpURLConnection;->setRequestMethod(Ljava/lang/String;)V
    const/4 v1, 2
    aget-object v1, v0, v1
    const-string v3, "\n"
    invoke-virtual {v1, v3}, Ljava/lang/String;->split(Ljava/lang/String;)[Ljava/lang/String;
    move-result-object v1
    const/4 v3, 0
    array-length v4, v1
    :hl
    if-ge v3, v4, :hd
    aget-object v5, v1, v3
    const/16 v6, 0x3a
    invoke-virtual {v5, v6}, Ljava/lang/String;->indexOf(I)I
    move-result v6
    if-lez v6, :hn
    const/4 v7, 0
    invoke-virtual {v5, v7, v6}, Ljava/lang/String;->substring(II)Ljava/lang/String;
    move-result-object v7
    invoke-virtual {v7}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v7
    add-int/lit8 v6, v6, 1
    invoke-virtual {v5, v6}, Ljava/lang/String;->substring(I)Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v5}, Ljava/lang/String;->trim()Ljava/lang/String;
    move-result-object v5
    invoke-virtual {v2, v7, v5}, Ljava/net/URLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    :hn
    add-int/lit8 v3, v3, 1
    goto/16 :hl
    :hd
    const/4 v1, 3
    aget-object v1, v0, v1
    invoke-virtual {v1}, Ljava/lang/String;->length()I
    move-result v3
    if-eqz v3, :nb
    const/4 v3, 1
    invoke-virtual {v2, v3}, Ljava/net/URLConnection;->setDoOutput(Z)V
    invoke-virtual {v2}, Ljava/net/URLConnection;->getOutputStream()Ljava/io/OutputStream;
    move-result-object v3
    const-string v4, "UTF-8"
    invoke-virtual {v1, v4}, Ljava/lang/String;->getBytes(Ljava/lang/String;)[B
    move-result-object v1
    invoke-virtual {v3, v1}, Ljava/io/OutputStream;->write([B)V
    invoke-virtual {v3}, Ljava/io/OutputStream;->close()V
    :nb
    invoke-virtual {v2}, Ljava/net/HttpURLConnection;->getResponseCode()I
    move-result v3
    const/16 v4, 400
    if-ge v3, v4, :err
    invoke-virtual {v2}, Ljava/net/URLConnection;->getInputStream()Ljava/io/InputStream;
    move-result-object v4
    goto/16 :rd
    :err
    invoke-virtual {v2}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;
    move-result-object v4
    :rd
    new-instance v5, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v5}, Ljava/io/ByteArrayOutputStream;-><init>()V
    if-eqz v4, :nin
    const/16 v6, 0x2000
    new-array v6, v6, [B
    :rl
    invoke-virtual {v4, v6}, Ljava/io/InputStream;->read([B)I
    move-result v7
    if-lez v7, :rdn
    const/4 v8, 0
    invoke-virtual {v5, v6, v8, v7}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto/16 :rl
    :rdn
    invoke-virtual {v4}, Ljava/io/InputStream;->close()V
    :nin
    new-instance v6, Ljava/lang/StringBuilder;
    invoke-direct {v6}, Ljava/lang/StringBuilder;-><init>()V
    invoke-virtual {v6, v3}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v7, "\u0001"
    invoke-virtual {v6, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v2}, Ljava/net/URLConnection;->getURL()Ljava/net/URL;
    move-result-object v8
    invoke-virtual {v8}, Ljava/net/URL;->toString()Ljava/lang/String;
    move-result-object v8
    invoke-virtual {v6, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v6, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const/4 v3, 0
    :gl
    invoke-virtual {v2, v3}, Ljava/net/URLConnection;->getHeaderFieldKey(I)Ljava/lang/String;
    move-result-object v8
    invoke-virtual {v2, v3}, Ljava/net/URLConnection;->getHeaderField(I)Ljava/lang/String;
    move-result-object v9
    if-nez v8, :hk
    if-nez v9, :gn
    goto/16 :gd
    :hk
    invoke-virtual {v6, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v10, ": "
    invoke-virtual {v6, v10}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v6, v9}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v10, "\n"
    invoke-virtual {v6, v10}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    :gn
    add-int/lit8 v3, v3, 1
    goto/16 :gl
    :gd
    invoke-virtual {v6, v7}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    new-instance v8, Ljava/lang/String;
    invoke-virtual {v5}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v9
    const-string v10, "UTF-8"
    invoke-direct {v8, v9, v10}, Ljava/lang/String;-><init>([BLjava/lang/String;)V
    invoke-virtual {v6, v8}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v6}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0
    goto/16 :put
    :te
    :handler
    move-exception v1
    new-instance v2, Ljava/lang/StringBuilder;
    invoke-direct {v2}, Ljava/lang/StringBuilder;-><init>()V
    const-string v3, "0\u0001ERR\u0001\u0001"
    invoke-virtual {v2, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v2, v1}, Ljava/lang/StringBuilder;->append(Ljava/lang/Object;)Ljava/lang/StringBuilder;
    invoke-virtual {v2}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v0
    :put
    iget-object v1, p0, Lnx/H;->m:Ljava/util/Hashtable;
    iget-object v2, p0, Lnx/H;->i:Ljava/lang/String;
    invoke-virtual {v1, v2, v0}, Ljava/util/Hashtable;->put(Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    return-void
    .catch Ljava/lang/Throwable; {:ts .. :te} :handler
.end method
